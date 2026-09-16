"use client"
import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ExternalLink, FileText, Globe } from "lucide-react"
import { useRouter } from "next/navigation"
import type { Citation } from "@/types"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"

type CitationEntry = Citation & { chunks: number[]; pages: number[] }

interface CitationCardProps {
  citation: Citation
  index: number
}

/**
 * Renders a single citation in the same bordered sources list used by CitationList.
 */
export function CitationCard({ citation, index }: CitationCardProps) {
  return (
    <ul className="overflow-hidden rounded-card border border-line bg-surface">
      <CitationRow entry={{ ...citation, chunks: [citation.chunk_index], pages: [citation.page] }} index={index} />
    </ul>
  )
}

// ─── CitationList ─────────────────────────────────────────────────────────────

interface CitationListProps {
  citations: Citation[]
}

/**
 * Groups multiple citations by document and renders one collapsible row per unique file,
 * merging all chunk indices for that file.
 */
export function CitationList({ citations }: CitationListProps) {
  if (!citations || citations.length === 0) return null

  // Group by document_id, keeping every page number and chunk index
  const grouped = citations.reduce<Record<string, CitationEntry>>(
    (acc, c) => {
      if (!acc[c.document_id]) {
        acc[c.document_id] = { ...c, chunks: [c.chunk_index], pages: [c.page] }
      } else {
        acc[c.document_id].chunks.push(c.chunk_index)
        acc[c.document_id].pages.push(c.page)
      }
      return acc
    },
    {}
  )

  const entries = Object.values(grouped)

  return (
    <section aria-label="Sources" className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas px-3 py-1.5">
        <span className="text-micro font-medium tracking-wide text-fg-subtle uppercase">Sources</span>
        <span className="text-micro text-fg-subtle">
          {entries.length} {entries.length === 1 ? "source" : "sources"}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {entries.map((entry, i) => (
          <CitationRow key={entry.document_id} entry={entry} index={i} />
        ))}
      </ul>
    </section>
  )
}

function CitationRow({ entry, index }: { entry: CitationEntry; index: number }) {
  const [open, setOpen] = useState(true)
  const router = useRouter()
  const bodyId = useId()
  const isWeb = entry.source_type === "web"

  const uniqueChunks = [...new Set(entry.chunks)].sort((a, b) => a - b)
  const uniquePages = [...new Set(entry.pages)].sort((a, b) => a - b)

  const handleViewInFiles = () => {
    router.push(`/files?highlight=${encodeURIComponent(entry.document_id)}`)
  }

  const SourceIcon = isWeb ? Globe : FileText

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...transition.base, delay: index * 0.04 }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-ring-inset"
      >
        <SourceIcon className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{entry.filename}</span>
          <span className="block text-caption text-fg-subtle">
            {isWeb ? "Live web source" : uniquePages.length === 1 ? `Page ${uniquePages[0]}` : `Pages ${uniquePages.join(" • ")}`}
          </span>
        </span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition.slow}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pr-3 pb-2 pl-9">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {isWeb ? (
                  <span className="truncate text-caption text-fg-subtle">Current information from the web</span>
                ) : (
                  <>
                    <span className="text-caption text-fg-subtle">Chunks</span>
                    {uniqueChunks.map(chunk => (
                      <span
                        key={chunk}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-subtle px-1.5 text-micro font-medium text-accent-strong tabular-nums"
                      >
                        {chunk + 1}
                      </span>
                    ))}
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => isWeb && entry.url ? window.open(entry.url, "_blank", "noopener,noreferrer") : handleViewInFiles()}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {isWeb ? "Open source" : "View document"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}
