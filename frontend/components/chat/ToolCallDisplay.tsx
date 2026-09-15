"use client"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { useId, useState } from "react"
import type { ToolCall } from "@/types"
import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"

const STATUS = {
  pending: { label: "Pending", icon: <Loader2 className="size-3.5 animate-spin text-warning" aria-hidden="true" /> },
  running: { label: "Running", icon: <Loader2 className="size-3.5 animate-spin text-accent-strong" aria-hidden="true" /> },
  done: { label: "Completed", icon: <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" /> },
  error: { label: "Failed", icon: <XCircle className="size-3.5 text-danger" aria-hidden="true" /> },
}

export function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const status = STATUS[toolCall.status]

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface text-caption">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-ring-inset"
      >
        {status.icon}
        <span className="font-mono text-fg">{toolCall.name}</span>
        <span className="sr-only">{status.label}</span>
        <ChevronDown className={cn("ml-auto size-3.5 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={transition.slow}
            className="overflow-hidden"
          >
            <pre className="overflow-x-auto border-t border-line bg-canvas px-3 py-2 font-mono text-fg-muted">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
            {toolCall.output && (
              <pre className="overflow-x-auto border-t border-line bg-canvas px-3 py-2 font-mono text-fg">
                {toolCall.output}
              </pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
