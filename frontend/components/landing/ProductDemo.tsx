"use client"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowUp, FileText, Files, LayoutDashboard, MessageSquare, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"
import { useDemoLoop, useTypewriter } from "./useDemoLoop"

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: MessageSquare, label: "Chat", active: true },
  { icon: Files, label: "Files" },
]

const DOCUMENTS = ["Q3_Report_2024.pdf", "Board_Minutes.docx", "Pricing_Notes.txt"]

const QUESTION = "What are the key findings in the Q3 report?"

const FINDINGS = [
  "Revenue grew 23% YoY to $4.2M",
  "Customer acquisition cost decreased by 18%",
  "Net Promoter Score improved to 72",
]

// 0 empty composer · 1 question typing · 2 searching · 3 answer streaming · 4 answer with sources
const STEPS = 5

/**
 * Hero illustration: one question runs from typing to a cited answer, on a loop.
 * Decorative — the figcaption describes the same thing for anyone who cannot see it.
 */
export function ProductDemo() {
  const reduced = useReducedMotion()
  const step = useDemoLoop(STEPS, { active: !reduced })
  const typed = useTypewriter(QUESTION, step === 1 && !reduced)

  const askSent = step >= 2
  const answering = step >= 3
  const complete = step >= 4
  const visibleFindings = complete ? FINDINGS.length : step === 3 ? 2 : 0

  return (
    <figure className="overflow-hidden rounded-card border border-line bg-surface shadow-overlay">
      <figcaption className="sr-only">
        DocuQuery answering a question about an uploaded Q3 report: revenue grew 23% year on year,
        customer acquisition cost fell 18%, and Net Promoter Score reached 72 — cited to page 7 of
        Q3_Report_2024.pdf.
      </figcaption>

      {/* Browser chrome */}
      <div aria-hidden="true" className="flex items-center gap-3 border-b border-line bg-surface-muted px-3 py-2">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <div className="mx-auto w-full max-w-xs truncate rounded-control border border-line bg-surface px-3 py-0.5 text-center text-micro text-fg-subtle">
          docuquery.ai/chat
        </div>
        <div className="w-10" />
      </div>

      <div aria-hidden="true" className="flex min-h-100 text-left">
        {/* Sidebar */}
        <div className="hidden w-52 shrink-0 flex-col gap-5 border-r border-line bg-canvas p-3 md:flex">
          <div className="space-y-0.5">
            {NAV.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-2 rounded-control px-2 py-1.5 text-caption",
                  active ? "bg-surface-muted font-medium text-fg" : "text-fg-muted"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </div>
            ))}
          </div>
          <div>
            <p className="px-2 pb-1 text-micro font-medium text-fg-subtle">Documents</p>
            {DOCUMENTS.map((name, i) => (
              <div
                key={name}
                className={cn(
                  "flex items-center gap-2 rounded-control px-2 py-1 text-caption transition-colors",
                  complete && i === 0 ? "bg-accent-subtle text-accent-strong" : "text-fg-muted"
                )}
              >
                <FileText className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="truncate">{name}</span>
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-success" />
              </div>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <p className="truncate font-medium">{askSent ? "Q3 report findings" : "New chat"}</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-control border border-line px-2 py-0.5 text-micro text-fg-muted">
              <Zap className="size-3" />
              DocuQuery mode
            </span>
          </div>

          <div className="flex-1 space-y-5 p-4 sm:p-6">
            <AnimatePresence>
              {askSent && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition.base}
                  className="flex justify-end"
                >
                  <p className="max-w-sm rounded-card bg-surface-muted px-3 py-2">{QUESTION}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {step === 2 && (
              <div className="flex items-center gap-2 text-fg-subtle">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle" />
                  <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle [animation-delay:300ms]" />
                </span>
                Searching your documents…
              </div>
            )}

            {answering && (
              <div className="max-w-xl space-y-3">
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-body-lg">
                  Based on the Q3 report, the key findings include:
                </motion.p>
                <ul className="space-y-1.5 text-body-lg">
                  {FINDINGS.slice(0, visibleFindings).map(finding => (
                    <motion.li
                      key={finding}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transition.base}
                      className="flex gap-2.5"
                    >
                      <span className="mt-2.5 size-1 shrink-0 rounded-full bg-fg-subtle" />
                      {finding}
                    </motion.li>
                  ))}
                  {!complete && (
                    <li className="flex gap-2.5">
                      <span className="mt-2.5 size-1 shrink-0 rounded-full bg-fg-subtle" />
                      <span className="inline-block h-4 w-0.5 animate-pulse rounded-full bg-fg-muted align-text-bottom" />
                    </li>
                  )}
                </ul>

                <AnimatePresence>
                  {complete && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transition.slow}
                      className="rounded-card border border-line bg-canvas"
                    >
                      <p className="border-b border-line px-3 py-1.5 text-micro font-medium tracking-wide text-fg-subtle uppercase">
                        Sources
                      </p>
                      <div className="flex items-center gap-2.5 px-3 py-2">
                        <FileText className="size-4 shrink-0 text-fg-subtle" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-caption font-medium">Q3_Report_2024.pdf</p>
                          <p className="text-micro text-fg-subtle">Page 7 · Chunks 12, 14</p>
                        </div>
                        <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent-strong">
                          Cited
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-line p-3">
            <div className="flex items-center gap-2 rounded-control border border-line-strong bg-surface py-1.5 pr-1.5 pl-3">
              <span className={cn("min-w-0 flex-1 truncate", step === 1 ? "text-fg" : "text-fg-subtle")}>
                {step === 1 ? typed : "Ask about your documents…"}
                {step === 1 && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-fg-muted align-text-bottom" />
                )}
              </span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-control transition-colors",
                  step === 1 ? "bg-accent text-on-accent" : "bg-surface-muted text-fg-subtle"
                )}
              >
                <ArrowUp className="size-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  )
}
