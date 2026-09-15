"use client"
import { motion } from "framer-motion"
import { useChatStore } from "@/stores/chat.store"
import { MessageBubble } from "./MessageBubble"
import { ChatInput } from "./ChatInput"
import { CHAT_MODE_ICONS } from "./modeIcons"
import { useAutoScroll } from "@/hooks/useAutoScroll"
import { CHAT_MODE_META } from "@/types"
import { generateId } from "@/lib/utils"
import { transition } from "@/lib/motion"
import type { Conversation } from "@/types"
import { getDefaultChatMode } from "@/stores/settings.store"

const SUGGESTIONS_BY_MODE = {
  docuquery: [
    "Ask a question about my uploaded documents",
    "Summarize my assignment document",
    "Compare the key points in my documents",
    "List action items from the uploaded files",
  ],
  llm: [
    "Explain a difficult concept to me",
    "Help me write or improve something",
    "Brainstorm ideas for my next project",
    "Have a normal conversation with me",
  ],
  hybrid: [
    "Answer the questions in my assignment",
    "Explain my document with outside context",
    "Summarize this and suggest next steps",
    "Compare my documents with current best practices",
  ],
}

const MODE_DETAILS = {
  docuquery: "Ask about files you have uploaded. Every answer is grounded in those documents.",
  llm: "Ask anything and have a general AI conversation without document retrieval.",
  hybrid: "Use your documents as context, then let AI reason through answers and next steps.",
}

export function ChatWindow() {
  const { conversations, activeId, isStreaming, addConversation, sendMessage } = useChatStore()
  const bottomRef = useAutoScroll()
  const active = conversations.find(c => c.id === activeId)

  const handleSuggestion = async (text: string) => {
    if (!activeId) {
      const conv: Conversation = {
        id: generateId(),
        title: text.slice(0, 52).trim(),
        messages: [],
        mode: getDefaultChatMode(),
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addConversation(conv)
      // Let the store flush before sending
      await new Promise(r => setTimeout(r, 0))
    }
    await sendMessage(text)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas text-body text-fg">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!active || active.messages.length === 0 ? (
          <WelcomeScreen onSuggestion={handleSuggestion} />
        ) : (
          <div
            role="log"
            aria-label="Conversation"
            // Hold screen-reader announcements until a streamed answer is complete.
            aria-busy={isStreaming}
            className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8"
          >
            {active.messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={i === active.messages.length - 1}
              />
            ))}
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-line bg-canvas">
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput />
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen({ onSuggestion }: { onSuggestion: (t: string) => void }) {
  const { activeMode } = useChatStore()
  const meta = CHAT_MODE_META[activeMode]
  const ModeIcon = CHAT_MODE_ICONS[activeMode]
  const suggestions = SUGGESTIONS_BY_MODE[activeMode]

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition.slow}
        className="flex w-full max-w-xl flex-col items-center text-center"
      >
        <div className="flex size-10 items-center justify-center rounded-card border border-line bg-surface text-fg-muted">
          <ModeIcon className="size-5" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-title font-semibold">{meta.label} mode</h1>
        <p className="mt-1 text-body-lg text-fg-muted">{meta.description}</p>
        <p className="mt-2 max-w-md text-fg-subtle">{MODE_DETAILS[activeMode]}</p>

        <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-card border border-line bg-surface px-3 py-2.5 text-left text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-ring"
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
