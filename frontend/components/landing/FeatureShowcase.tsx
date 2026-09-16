"use client"
import { motion } from "framer-motion"
import { Bot, Brain, Check, CheckCircle2, ExternalLink, FileText, Globe, Loader2, Quote, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"

const reveal = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: transition.slow,
} as const

/** Sources list exactly as it appears under an answer, next to the file it points at. */
function CitationMock() {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <p className="text-micro font-medium tracking-wide text-fg-subtle uppercase">Sources</p>
          <p className="text-micro text-fg-subtle">2 sources</p>
        </div>
        <div className="divide-y divide-line">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <FileText className="size-4 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-caption font-medium">Q3_Report_2024.pdf</p>
              <p className="text-micro text-fg-subtle">Page 7</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-micro text-fg-muted">
              <ExternalLink className="size-3" />
              View document
            </span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2">
            <Globe className="size-4 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-caption font-medium">Carrier fuel index</p>
              <p className="text-micro text-fg-subtle">Live web source</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-control bg-accent-subtle px-3 py-2 text-caption text-accent-strong">
        <Quote className="size-3.5 shrink-0" />
        Opens Files with that document highlighted
      </div>
    </div>
  )
}

const MODES = [
  { icon: Zap, label: "DocuQuery", desc: "Grounded in your documents only", current: true },
  { icon: Bot, label: "LLM", desc: "General AI, no retrieval", current: false },
  { icon: Brain, label: "Hybrid", desc: "Documents first, then reasoning", current: false },
]

function ModesMock() {
  return (
    <ul className="space-y-2">
      {MODES.map(({ icon: Icon, label, desc, current }) => (
        <li
          key={label}
          className={cn(
            "flex items-start gap-3 rounded-card border bg-surface p-3",
            current ? "border-accent ring-1 ring-accent" : "border-line"
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-canvas text-fg-muted">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-medium">{label}</span>
              {current && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-micro font-medium text-fg-muted">
                  <Check className="size-3" />
                  Current
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-caption text-fg-muted">{desc}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

const LIBRARY_ROWS = [
  { name: "Q3_Report_2024.pdf", size: "2.4 MB", status: "Indexed" },
  { name: "Board_Minutes.docx", size: "840 KB", status: "Processing" },
  { name: "Pricing_Notes.txt", size: "12 KB", status: "Indexed" },
]

const LIBRARY_STATS = [
  { label: "Documents", value: "3" },
  { label: "Indexed", value: "2" },
  { label: "Processing", value: "1" },
]

function LibraryMock() {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 overflow-hidden rounded-card border border-line bg-surface">
        {LIBRARY_STATS.map(({ label, value }, i) => (
          <div key={label} className={cn("border-line px-3 py-2.5", i > 0 && "border-l")}>
            <dt className="text-micro text-fg-muted">{label}</dt>
            <dd className="mt-0.5 text-title-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <table className="w-full table-fixed border-collapse text-left">
          <tbody>
            {LIBRARY_ROWS.map(({ name, size, status }) => (
              <tr key={name} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-3.5 shrink-0 text-fg-subtle" />
                    <span className="truncate text-caption font-medium">{name}</span>
                  </div>
                </td>
                <td className="w-28 px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium",
                      status === "Indexed" ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"
                    )}
                  >
                    {status === "Indexed" ? <CheckCircle2 className="size-3" /> : <Loader2 className="size-3" />}
                    {status}
                  </span>
                </td>
                <td className="hidden w-20 px-3 py-2 text-right text-caption text-fg-muted tabular-nums sm:table-cell">
                  {size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ROWS = [
  {
    title: "Every answer shows its receipts",
    body: "Answers arrive with the documents behind them — filename, page and passage. Open the source in one click and check it yourself.",
    points: ["Page and passage level citations", "Web sources marked separately in Hybrid mode"],
    mock: CitationMock,
  },
  {
    title: "Three ways to ask, one place",
    body: "Keep an answer strictly inside your documents, ask the model anything, or combine the two when your files only tell part of the story.",
    points: ["Switch modes mid-conversation", "Pick the default that fits your work"],
    mock: ModesMock,
  },
  {
    title: "A library you can actually scan",
    body: "A dense table of everything you have uploaded, with indexing state at a glance and a running count of what is ready to query.",
    points: ["Upload by drag and drop or file picker", "Delete removes the file and its passages"],
    mock: LibraryMock,
  },
]

export function FeatureShowcase() {
  return (
    <div className="mt-14 space-y-16 sm:space-y-24">
      {ROWS.map(({ title, body, points, mock: Mock }, i) => (
        <motion.div
          key={title}
          {...reveal}
          className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
        >
          <div className={cn("min-w-0", i % 2 === 1 && "lg:order-2")}>
            <h3 className="text-title font-semibold sm:text-title-lg">{title}</h3>
            <p className="mt-3 text-body-lg text-fg-muted">{body}</p>
            <ul className="mt-5 space-y-2">
              {points.map(point => (
                <li key={point} className="flex items-start gap-2.5 text-fg-muted">
                  <Check className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden="true" className={cn("min-w-0", i % 2 === 1 && "lg:order-1")}>
            <Mock />
          </div>
        </motion.div>
      ))}
    </div>
  )
}
