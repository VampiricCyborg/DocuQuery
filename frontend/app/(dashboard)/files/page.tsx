"use client"
import { useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Quote } from "lucide-react"
import { FileUploadZone, FileList } from "@/components/file-upload/FileUploadZone"
import { useFileStore } from "@/stores/file.store"
import { transition } from "@/lib/motion"

/**
 * Reads ?highlight=<document_id> from the URL and highlights
 * the matching file row.  This is navigated to from CitationCard's
 * "View Document" button.
 */
function FilesContent() {
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("highlight")
  const { files, loadFiles } = useFileStore()
  const highlightedFileLoaded = !!highlightId && files.some(file => file.id === highlightId)

  useEffect(() => { void loadFiles() }, [loadFiles])

  // Scroll to the highlighted file once its row exists — the list usually loads after mount.
  useEffect(() => {
    if (highlightId && highlightedFileLoaded) {
      document.getElementById(`document-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [highlightId, highlightedFileLoaded])

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-4 py-6 text-body text-fg sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-title-lg font-semibold">Files</h1>
          <p className="mt-1 text-fg-muted">Upload documents for RAG retrieval</p>
          {highlightId && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition.base}
              className="mt-3 flex items-center gap-2 rounded-control bg-accent-subtle px-3 py-2 text-accent-strong"
            >
              <Quote className="size-4 shrink-0" aria-hidden="true" />
              Navigated from a citation — the referenced document is highlighted below
            </motion.p>
          )}
        </header>

        <FileUploadZone />

        <FileList highlightId={highlightId} />
      </div>
    </div>
  )
}

export default function FilesPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-canvas p-6 text-body text-fg-subtle">Loading…</div>}>
      <FilesContent />
    </Suspense>
  )
}
