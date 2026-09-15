"use client"
import { motion } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertCircle, Check, Copy, FileSearch, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react"
import type { Message } from "@/types"
import { Tooltip } from "@/components/ui/Tooltip"
import { useCopy } from "@/hooks/useCopy"
import { useChatStore } from "@/stores/chat.store"
import { useSettingsStore } from "@/stores/settings.store"
import { formatTime, cn } from "@/lib/utils"
import { transition } from "@/lib/motion"
import { ToolCallDisplay } from "./ToolCallDisplay"
import { CitationList } from "./CitationCard"

export function MessageBubble({ message, isLast }: { message: Message; isLast: boolean }) {
  const { copy, copied } = useCopy()
  const retryLast = useChatStore(s => s.retryLast)
  const setFeedback = useChatStore(s => s.setFeedback)
  const activeId = useChatStore(s => s.activeId)
  const showCitations = useSettingsStore(s => s.showCitations)
  const isUser = message.role === "user"
  const streaming = message.status === "streaming"
  const hasCitations = !isUser && (message.citations?.length ?? 0) > 0

  const handleFeedback = (fb: "up" | "down") => {
    if (!activeId) return
    const next = message.feedback === fb ? null : fb
    setFeedback(activeId, message.id, next)
  }

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition.base}
        className="group flex flex-col items-end gap-1"
      >
        <span className="sr-only">You said:</span>
        <div className="max-w-5/6 rounded-card bg-surface-muted px-3.5 py-2.5 text-body-lg text-fg sm:max-w-3/4">
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        </div>
        <time
          dateTime={message.timestamp}
          className="text-micro text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
        >
          {formatTime(message.timestamp)}
        </time>
      </motion.div>
    )
  }

  return (
    <motion.article
      aria-label="DocuQuery response"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.base}
      className="group flex gap-3"
    >
      <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control bg-fg text-canvas">
        <FileSearch className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex h-6 items-center gap-2">
          <span className="font-medium">DocuQuery</span>
          <time dateTime={message.timestamp} className="text-micro text-fg-subtle">{formatTime(message.timestamp)}</time>
        </div>

        {message.toolCalls?.map(tc => (
          <ToolCallDisplay key={tc.id} toolCall={tc} />
        ))}

        {streaming && !message.content ? (
          <TypingIndicator />
        ) : (
          <div className="max-w-reading text-body-lg text-fg">
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
            {streaming && (
              <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-fg-muted align-text-bottom" />
            )}
          </div>
        )}

        {/* Sources are set apart from the generated text in their own bordered list */}
        {showCitations && hasCitations && message.status === "done" && (
          <CitationList citations={message.citations!} />
        )}

        {message.status === "error" && (
          <p role="alert" className="flex items-center gap-1.5 text-danger">
            <AlertCircle className="size-4" aria-hidden="true" />
            Failed to generate a response
          </p>
        )}

        {message.status === "done" && (
          <div
            className={cn(
              "-ml-1.5 flex items-center gap-0.5 transition-opacity",
              // The latest answer keeps its actions visible; older ones reveal them on hover or keyboard focus.
              isLast
                ? "opacity-100"
                : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
            )}
          >
            <ActionButton label={copied ? "Copied" : "Copy response"} onClick={() => copy(message.content)}>
              {copied ? <Check className="text-success" aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </ActionButton>
            <ActionButton label="Good response" pressed={message.feedback === "up"} onClick={() => handleFeedback("up")}>
              <ThumbsUp className={cn(message.feedback === "up" && "text-success")} aria-hidden="true" />
            </ActionButton>
            <ActionButton label="Bad response" pressed={message.feedback === "down"} onClick={() => handleFeedback("down")}>
              <ThumbsDown className={cn(message.feedback === "down" && "text-danger")} aria-hidden="true" />
            </ActionButton>
            {isLast && (
              <ActionButton label="Regenerate" onClick={retryLast}>
                <RefreshCw aria-hidden="true" />
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}

function ActionButton({ label, pressed, onClick, children }: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="flex size-7 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg focus-ring [&_svg]:size-3.5"
      >
        {children}
      </button>
    </Tooltip>
  )
}

function TypingIndicator() {
  return (
    <div role="status" className="flex items-center gap-2 py-0.5 text-fg-subtle">
      <span className="flex gap-1" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle" />
        <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle [animation-delay:300ms]" />
      </span>
      Thinking…
    </div>
  )
}
