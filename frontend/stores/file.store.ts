import { create } from "zustand"
import type { FileAttachment } from "@/types"
import { generateId } from "@/lib/utils"
import { documentApi } from "@/services/api"

interface FileStore {
  files: FileAttachment[]
  loadFiles: () => Promise<void>
  addFile: (file: File) => Promise<void>
  /** Drops a row locally only — for uploads that never reached the server. */
  removeFile: (id: string) => void
  /** Deletes the document on the server; the row returns if the request fails. */
  deleteFile: (id: string) => Promise<void>
  reset: () => void
}

const mapDocument = (doc: Awaited<ReturnType<typeof documentApi.list>>[number]): FileAttachment => ({
  id: doc.id,
  name: doc.original_filename,
  size: doc.file_size,
  type: doc.file_type === "pdf" ? "pdf" : doc.file_type === "docx" ? "docx" : doc.file_type === "txt" ? "txt" : "other",
  status: doc.status === "indexed" ? "ready" : doc.status === "failed" ? "error" : "processing",
  progress: doc.status === "indexed" ? 100 : undefined,
  uploadedAt: doc.upload_time,
})

export const useFileStore = create<FileStore>()((set, get) => ({
  files: [],
  loadFiles: async () => {
    try { set({ files: (await documentApi.list()).map(mapDocument) }) } catch { /* retain local upload state */ }
  },

  addFile: async (file) => {
    const ext = file.name.split(".").pop()?.toLowerCase()
    const type = ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : ext === "txt" ? "txt" : ["jpg","jpeg","png","webp"].includes(ext ?? "") ? "image" : "other"
    const id = generateId()
    const entry: FileAttachment = { id, name: file.name, size: file.size, type, status: "uploading", progress: 0 }

    set(s => ({ files: [entry, ...s.files] }))

    try {
      const uploaded = await documentApi.upload(file, (progress) => {
        set(s => ({ files: s.files.map(f => f.id === id ? { ...f, progress } : f) }))
      })
      set(s => ({ files: s.files.map(f => f.id === id ? { ...mapDocument(uploaded), status: "processing", progress: 100 } : f) }))
    } catch {
      set(s => ({ files: s.files.map(f => f.id === id ? { ...f, status: "error" } : f) }))
    }
  },

  removeFile: (id) => set(s => ({ files: s.files.filter(f => f.id !== id) })),

  deleteFile: async (id) => {
    const previous = get().files
    set(s => ({ files: s.files.filter(f => f.id !== id) }))
    try {
      await documentApi.delete(id)
    } catch (error) {
      set({ files: previous })
      throw error
    }
  },

  // Drops the signed-in user's document list (sign-out / account switch).
  reset: () => set({ files: [] }),
}))
