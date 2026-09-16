"use client"
import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUp, Loader2, Mic, MicOff, Paperclip, X } from "lucide-react"
import { useChatStore } from "@/stores/chat.store"
import { useFileStore } from "@/stores/file.store"
import { useVoice } from "@/hooks/useVoice"
import { Button } from "@/components/ui/Button"
import { Tooltip } from "@/components/ui/Tooltip"
import { ModeIndicator } from "./ModeIndicator"
import { cn, formatBytes, generateId } from "@/lib/utils"
import { transition } from "@/lib/motion"
import { CHAT_MODE_META } from "@/types"
import type { Conversation } from "@/types"
import { getDefaultChatMode } from "@/stores/settings.store"

const MODE_PLACEHOLDERS = {
  docuquery: "Ask about your uploaded documents…",
  llm: "Chat with AI freely…",
  hybrid: "Ask anything — documents first, then AI knowledge…",
}

export function ChatInput() {
  const [text, setText] = useState("")
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { sendMessage, isStreaming, activeId, addConversation, activeMode } = useChatStore()
  const { addFile } = useFileStore()

  const { voiceState, start: startVoice, stop: stopVoice } = useVoice((transcript) => {
    setText(t => t + (t ? " " : "") + transcript)
    textareaRef.current?.focus()
  })
  const listening = voiceState === "listening"

  const handleSubmit = useCallback(async () => {
    const content = text.trim()
    if (!content || isStreaming) return

    if (!activeId) {
      const conv: Conversation = {
        id: generateId(),
        title: "New Chat",
        messages: [],
        mode: getDefaultChatMode(),
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addConversation(conv)
    }

    setText("")
    setPendingFiles([])
    for (const f of pendingFiles) addFile(f)

    // Small delay to allow the store to register the new conversation
    await new Promise(r => setTimeout(r, 0))
    await sendMessage(content)
    textareaRef.current?.style.setProperty("height", "auto")
  }, [text, isStreaming, activeId, pendingFiles, addFile, addConversation, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setPendingFiles(p => [...p, ...files])
    e.target.value = ""
  }

  const removePending = (i: number) => setPendingFiles(p => p.filter((_, idx) => idx !== i))

  return (
    <div className="px-4 pt-3 pb-4 sm:px-6">
      {/* Mode indicator row */}
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <ModeIndicator />
        <span className="truncate text-caption text-fg-subtle">
          {CHAT_MODE_META[activeMode].description}
        </span>
      </div>

      {/* Pending file chips */}
      <AnimatePresence>
        {pendingFiles.length > 0 && (
          <motion.ul
            aria-label="Files to upload with this message"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition.base}
            className="mb-2 flex flex-wrap gap-1.5"
          >
            {pendingFiles.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-1.5 rounded-control border border-line bg-surface py-1 pr-1 pl-2 text-caption"
              >
                <Paperclip className="size-3 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="max-w-40 truncate text-fg">{f.name}</span>
                <span className="text-fg-subtle">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => removePending(i)}
                  className="flex size-5 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg focus-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Input box */}
      <div className="flex items-end gap-1 rounded-card border border-line-strong bg-surface p-1.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        {/* Attach */}
        <Tooltip content="Attach file">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" aria-hidden="true" />
          </Button>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          aria-label="Message"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={MODE_PLACEHOLDERS[activeMode]}
          rows={1}
          disabled={isStreaming}
          className="max-h-50 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-body-lg text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-50"
        />

        {/* Voice */}
        <Tooltip content={listening ? "Stop listening" : "Voice input"}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={listening ? "Stop listening" : "Voice input"}
            aria-pressed={listening}
            className={cn("shrink-0", listening && "bg-danger-subtle text-danger hover:bg-danger-subtle hover:text-danger")}
            onClick={listening ? stopVoice : startVoice}
          >
            {listening
              ? <MicOff className="size-4" aria-hidden="true" />
              : <Mic className="size-4" aria-hidden="true" />}
          </Button>
        </Tooltip>

        {/* Send */}
        <Tooltip content={isStreaming ? "Generating response…" : "Send (Enter)"}>
          <Button
            size="icon"
            className="shrink-0"
            aria-label={isStreaming ? "Generating response" : "Send message"}
            disabled={(!text.trim() && !isStreaming) || isStreaming}
            onClick={handleSubmit}
          >
            {isStreaming
              ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              : <ArrowUp className="size-4" aria-hidden="true" />}
          </Button>
        </Tooltip>
      </div>

      <p className="mt-2 text-center text-micro text-fg-subtle">
        DocuQuery can make mistakes. Verify important information.
      </p>
    </div>
  )
}
