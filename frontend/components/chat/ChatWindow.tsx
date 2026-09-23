"use client"
import { useMemo } from "react"
import { motion } from "framer-motion"
import { useChatStore } from "@/stores/chat.store"
import { useActiveConversationId, useConversation } from "@/hooks/useConversations"
import { useChatStream } from "@/hooks/useChatStream"
import { MessageBubble } from "./MessageBubble"
import { ChatInput } from "./ChatInput"
import { CHAT_MODE_ICONS } from "./modeIcons"
import { useAutoScroll } from "@/hooks/useAutoScroll"
import { CHAT_MODE_META } from "@/types"
import type { ChatMode, Message } from "@/types"
import { transition } from "@/lib/motion"
import { Skeleton } from "@/components/ui/Skeleton"

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

// Ids for the two bubbles that exist only while an answer is streaming. They are
// never sent anywhere: the server assigns real ids, which arrive with the refetch.
const PENDING_USER_ID = "pending-user"
const PENDING_ASSISTANT_ID = "pending-assistant"

export function ChatWindow() {
  const activeId = useActiveConversationId()
  const { data: conversation, isLoading } = useConversation(activeId)
  const { send } = useChatStream()

  const draftMode = useChatStore(s => s.draftMode)
  const streamConversationId = useChatStore(s => s.streamConversationId)
  const streamUserText = useChatStore(s => s.streamUserText)
  const streamText = useChatStore(s => s.streamText)
  const streamCitations = useChatStore(s => s.streamCitations)
  const streamStatus = useChatStore(s => s.streamStatus)
  const streamIsRetry = useChatStore(s => s.streamIsRetry)

  const mode: ChatMode = conversation?.mode ?? draftMode

  // The buffer belongs to this thread when the ids match, and also when neither
  // has one yet -- a brand-new chat being answered in this very window, before
  // the server has said what its id is. Requiring both to be null matters: if
  // you navigate into another conversation while a new chat is still streaming,
  // its tokens must not appear in the thread you just opened.
  const streamingHere =
    streamStatus !== "idle" &&
    (streamConversationId === activeId ||
      (streamConversationId === null && activeId === null))

  const messages = useMemo<Message[]>(() => {
    const stored = conversation?.messages ?? []
    if (!streamingHere) return stored

    const pending: Message[] = []
    // A retry re-answers a question already on screen, so only the reply is new.
    if (!streamIsRetry && streamUserText) {
      pending.push({
        id: PENDING_USER_ID,
        role: "user",
        content: streamUserText,
        status: "done",
        timestamp: new Date().toISOString(),
      })
    }
    pending.push({
      id: PENDING_ASSISTANT_ID,
      role: "assistant",
      content: streamText,
      status: streamStatus === "error" ? "error" : "streaming",
      timestamp: new Date().toISOString(),
      citations: streamCitations,
    })

    // On a retry the stored answer is about to be replaced server-side; drop it
    // here too, or the old and new answers sit side by side while it streams.
    const base = streamIsRetry
      ? stored.slice(0, stored.findLastIndex(m => m.role === "assistant"))
      : stored
    return [...base, ...pending]
  }, [conversation, streamingHere, streamIsRetry, streamUserText, streamText, streamStatus, streamCitations])

  const bottomRef = useAutoScroll(messages.length, streamText)

  const handleSuggestion = (text: string) => {
    void send(text, mode, activeId)
  }

  const showWelcome = !activeId && messages.length === 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas text-body text-fg">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {showWelcome ? (
          <WelcomeScreen mode={mode} onSuggestion={handleSuggestion} />
        ) : isLoading && messages.length === 0 ? (
          <LoadingTranscript />
        ) : messages.length === 0 ? (
          <WelcomeScreen mode={mode} onSuggestion={handleSuggestion} />
        ) : (
          <div
            role="log"
            aria-label="Conversation"
            // Hold screen-reader announcements until a streamed answer is complete.
            aria-busy={streamingHere && streamStatus === "streaming"}
            className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8"
          >
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={i === messages.length - 1}
                conversationId={activeId}
                mode={mode}
              />
            ))}
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-line bg-canvas">
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput mode={mode} />
        </div>
      </div>
    </div>
  )
}

function LoadingTranscript() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <p className="sr-only">Loading conversation…</p>
      <Skeleton className="ml-auto h-10 w-2/3 rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="ml-auto h-10 w-1/2 rounded-card" />
    </div>
  )
}

function WelcomeScreen({ mode, onSuggestion }: { mode: ChatMode; onSuggestion: (t: string) => void }) {
  const meta = CHAT_MODE_META[mode]
  const ModeIcon = CHAT_MODE_ICONS[mode]
  const suggestions = SUGGESTIONS_BY_MODE[mode]

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
        <p className="mt-2 max-w-md text-fg-subtle">{MODE_DETAILS[mode]}</p>

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
