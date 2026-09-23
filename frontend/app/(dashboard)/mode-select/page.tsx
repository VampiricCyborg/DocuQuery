"use client"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, Check } from "lucide-react"
import { useChatStore } from "@/stores/chat.store"
import { CHAT_MODE_META, type ChatMode } from "@/types"
import { CHAT_MODE_ICONS } from "@/components/chat/modeIcons"
import { generateId, cn } from "@/lib/utils"
import { transition } from "@/lib/motion"
import type { Conversation } from "@/types"

const MODES: ChatMode[] = ["docuquery", "llm", "hybrid"]

const MODE_FEATURES: Record<ChatMode, string[]> = {
  docuquery: [
    "Answers grounded only in your documents",
    "Tells you when your documents don't cover a question",
    "Cites exact sources with page numbers",
    "Best for specific document questions",
  ],
  llm: [
    "Full AI general knowledge available",
    "No document retrieval overhead",
    "Great for explanations and brainstorming",
    "Like ChatGPT — open-ended conversation",
  ],
  hybrid: [
    "Searches documents first",
    "Falls back to AI knowledge when needed",
    "Clearly separates document vs AI content",
    "Best of both worlds",
  ],
}

export default function ModeSelectPage() {
  const router = useRouter()
  const draftMode = useChatStore(s => s.draftMode)
  const setDraftMode = useChatStore(s => s.setDraftMode)

  // Only the draft mode is set. Nothing is created until a message is sent, so
  // browsing the modes no longer leaves empty chats behind -- and it cannot
  // rewrite the mode of whichever conversation was open before this page.
  const handleSelect = (mode: ChatMode) => {
    setDraftMode(mode)
    router.push("/chat")
  }

  const handleContinue = () => {
    router.push("/chat")
  }

  return (
    // No vertical centering on the scroll container: when the cards are taller than the screen,
    // centered content overflows upward where it can't be scrolled to. m-auto centers only when it fits.
    <div className="flex flex-1 overflow-y-auto bg-canvas px-4 py-8 text-body text-fg sm:px-6 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition.slow}
        className="@container m-auto w-full max-w-4xl"
      >
        <header className="mb-8 text-center">
          <h1 className="text-title-lg font-semibold">Welcome to DocuQuery</h1>
          <p className="mt-1 text-body-lg text-fg-muted">How would you like to use AI today?</p>
        </header>

        <ul className="mb-8 grid gap-3 @2xl:grid-cols-3">
          {MODES.map(mode => {
            const meta = CHAT_MODE_META[mode]
            const ModeIcon = CHAT_MODE_ICONS[mode]
            const isActive = draftMode === mode

            return (
              <li key={mode} className="flex">
                <button
                  type="button"
                  onClick={() => handleSelect(mode)}
                  aria-label={`Use ${meta.label}${isActive ? ", current mode" : ""}`}
                  aria-describedby={`mode-${mode}-summary`}
                  className={cn(
                    "group flex w-full flex-col gap-4 rounded-card border bg-surface p-5 text-left transition-colors hover:bg-surface-muted focus-ring",
                    isActive ? "border-line-strong" : "border-line"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-control border border-line bg-canvas text-fg-muted">
                      <ModeIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-title-sm font-semibold">{meta.label}</span>
                      {isActive && <span className="block text-caption text-fg-subtle">Current mode</span>}
                    </span>
                  </span>

                  <span id={`mode-${mode}-summary`} className="text-fg-muted">
                    {meta.description}
                  </span>

                  {/* Buttons may only contain phrasing content, so the feature list is built from spans */}
                  <span className="block space-y-1.5">
                    {MODE_FEATURES[mode].map(feature => (
                      <span key={feature} className="flex items-start gap-2 text-caption text-fg-muted">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                        {feature}
                      </span>
                    ))}
                  </span>

                  <span className="mt-auto flex items-center justify-between border-t border-line pt-3 font-medium">
                    Use {meta.label}
                    <ArrowRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="text-center">
          <button
            type="button"
            onClick={handleContinue}
            className="rounded-control text-fg-muted underline underline-offset-4 transition-colors hover:text-fg focus-ring"
          >
            Continue with current mode ({CHAT_MODE_META[draftMode].label})
          </button>
        </div>
      </motion.div>
    </div>
  )
}
