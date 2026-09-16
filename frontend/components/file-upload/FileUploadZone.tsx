"use client"
import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, CheckCircle2, File, FileText, Image, Loader2, Upload, X } from "lucide-react"
import toast from "react-hot-toast"
import { useFileStore } from "@/stores/file.store"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { cn, formatBytes } from "@/lib/utils"
import { transition } from "@/lib/motion"
import type { FileAttachment } from "@/types"

// Matches the backend's accepted upload types (ALLOWED_EXTENSIONS: pdf, docx, txt, md).
const ACCEPTED = { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"], "text/plain": [".txt"], "text/markdown": [".md"] }

export function FileUploadZone() {
  const { addFile } = useFileStore()

  const onDrop = useCallback((accepted: File[]) => {
    accepted.forEach(f => addFile(f))
  }, [addFile])

  // "Browse files" is the keyboard entry point (noKeyboard keeps the zone itself out of the tab
  // order); clicking anywhere on the zone still opens the file picker.
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, accept: ACCEPTED, multiple: true, noKeyboard: true })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed px-6 py-10 text-center transition-colors",
        isDragActive
          ? "border-accent bg-accent-subtle"
          : "border-line-strong bg-surface hover:bg-surface-muted"
      )}
    >
      <input {...getInputProps()} />
      <div className={cn(
        "flex size-10 items-center justify-center rounded-full transition-colors",
        isDragActive ? "bg-surface text-accent-strong" : "bg-surface-muted text-fg-muted"
      )}>
        <Upload className="size-5" aria-hidden="true" />
      </div>
      <p className="mt-3 font-medium text-fg">
        {isDragActive ? "Drop files here" : "Drag & drop files here"}
      </p>
      <p className="mt-1 text-caption text-fg-subtle">PDF, DOCX, TXT, MD — up to 50MB each</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={event => {
          // Stop the click reaching the zone, which would open the picker a second time.
          event.stopPropagation()
          open()
        }}
      >
        Browse files
      </Button>
    </div>
  )
}

export function FileList({ highlightId }: { highlightId?: string | null } = {}) {
  const { files, removeFile, deleteFile } = useFileStore()
  const [pendingDelete, setPendingDelete] = useState<FileAttachment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    // An upload still in flight has no document on the server yet — drop the row only.
    if (pendingDelete.status === "uploading") {
      removeFile(pendingDelete.id)
      setPendingDelete(null)
      return
    }
    setDeleting(true)
    try {
      await deleteFile(pendingDelete.id)
      toast.success(`Deleted ${pendingDelete.name}`)
      setPendingDelete(null)
    } catch {
      toast.error(`Could not delete ${pendingDelete.name}`)
    } finally {
      setDeleting(false)
    }
  }

  if (files.length === 0) return null

  return (
    <>
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Uploaded documents</caption>
        <thead className="border-b border-line bg-canvas text-caption text-fg-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Name</th>
            <th scope="col" className="w-32 px-3 py-2 font-medium">Status</th>
            <th scope="col" className="hidden w-24 px-3 py-2 text-right font-medium sm:table-cell">Size</th>
            <th scope="col" className="hidden w-48 px-3 py-2 text-right font-medium md:table-cell">Uploaded</th>
            <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {files.map(f => (
              <FileRow key={f.id} file={f} highlighted={f.id === highlightId} onRequestDelete={() => setPendingDelete(f)} />
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      open={pendingDelete !== null}
      onOpenChange={open => { if (!open && !deleting) setPendingDelete(null) }}
      title="Delete document?"
      description={
        pendingDelete
          ? `${pendingDelete.name} and everything indexed from it will be removed. This can't be undone.`
          : ""
      }
      busy={deleting}
      onConfirm={confirmDelete}
    />
    </>
  )
}

function FileRow({ file, highlighted, onRequestDelete }: { file: FileAttachment; highlighted?: boolean; onRequestDelete: () => void }) {
  const Icon = file.type === "pdf" ? FileText : file.type === "image" ? Image : File

  return (
    <motion.tr
      id={`document-${file.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition.base}
      className={cn(
        "border-b border-line text-body transition-colors last:border-0",
        highlighted ? "bg-accent-subtle" : "hover:bg-surface-muted"
      )}
    >
      <td className="relative px-3 py-2">
        {highlighted && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{file.name}</p>
            {highlighted && <p className="text-caption text-accent-strong">Referenced in citation</p>}
            <p className="text-caption text-fg-subtle sm:hidden">{formatBytes(file.size)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <FileStatus file={file} />
      </td>
      <td className="hidden px-3 py-2 text-right text-fg-muted tabular-nums sm:table-cell">{formatBytes(file.size)}</td>
      <td className="hidden truncate px-3 py-2 text-right text-fg-muted tabular-nums md:table-cell">
        {file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : "—"}
      </td>
      <td className="px-2 py-2 text-right">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${file.name}`} onClick={onRequestDelete}>
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </td>
    </motion.tr>
  )
}

/** Status is always spelled out; progress only appears when the upload reports a real number. */
export function FileStatus({ file }: { file: FileAttachment }) {
  if (file.status === "ready") {
    return <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden="true" />Indexed</Badge>
  }
  if (file.status === "error") {
    return <Badge variant="error"><AlertCircle className="size-3" aria-hidden="true" />Failed</Badge>
  }
  if (file.status === "processing") {
    return <Badge variant="warning"><Loader2 className="size-3 animate-spin" aria-hidden="true" />Processing</Badge>
  }

  const progress = typeof file.progress === "number" ? file.progress : null
  return (
    <div className="space-y-1">
      <Badge><Loader2 className="size-3 animate-spin" aria-hidden="true" />Uploading{progress !== null && ` ${progress}%`}</Badge>
      {progress !== null && (
        <div
          role="progressbar"
          aria-label={`Uploading ${file.name}`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
