import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { ChatMode, Citation } from "@/types"

/**
 * UI state for chat. Not the conversations themselves.
 *
 * Conversations and messages now live on the server and are read through
 * TanStack Query (see hooks/useConversations.ts); this store holds only what the
 * server has no opinion about: whether the sidebar is open, which mode a
 * not-yet-created chat will start in, and the answer currently being streamed.
 *
 * The streamed answer is deliberately here and not in the query cache. It is not
 * server state — it is a few hundred milliseconds of tokens that the server will
 * hand back as a real message as soon as the stream ends, at which point the
 * query refetches and this buffer is dropped.
 */

export type StreamStatus = "idle" | "streaming" | "error"

interface ChatUIStore {
  sidebarOpen: boolean
  toggleSidebar: () => void

  /** Mode for the next conversation. An open conversation uses its own stored mode. */
  draftMode: ChatMode
  setDraftMode: (mode: ChatMode) => void

  // --- In-flight answer ---
  /** Null while the server has not yet told us which conversation this belongs to. */
  streamConversationId: string | null
  /** The message being answered, shown optimistically above the streaming reply. */
  streamUserText: string
  streamText: string
  streamCitations: Citation[]
  streamStatus: StreamStatus
  /** True for a retry, where the user's message is already on screen from the server. */
  streamIsRetry: boolean

  beginStream: (args: { conversationId: string | null; userText: string; isRetry: boolean }) => void
  attachStreamConversation: (conversationId: string) => void
  appendStreamToken: (token: string) => void
  setStreamCitations: (citations: Citation[]) => void
  failStream: () => void
  endStream: () => void
}

const IDLE = {
  streamConversationId: null,
  streamUserText: "",
  streamText: "",
  streamCitations: [] as Citation[],
  streamStatus: "idle" as StreamStatus,
  streamIsRetry: false,
}

export const useChatStore = create<ChatUIStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

      draftMode: "docuquery",
      setDraftMode: (draftMode) => set({ draftMode }),

      ...IDLE,

      beginStream: ({ conversationId, userText, isRetry }) =>
        set({
          ...IDLE,
          streamConversationId: conversationId,
          streamUserText: userText,
          streamIsRetry: isRetry,
          streamStatus: "streaming",
        }),

      attachStreamConversation: (streamConversationId) => set({ streamConversationId }),

      appendStreamToken: (token) => set(s => ({ streamText: s.streamText + token })),

      setStreamCitations: (streamCitations) => set({ streamCitations }),

      failStream: () => set({ streamStatus: "error" }),

      endStream: () => set({ ...IDLE }),
    }),
    {
      name: "docuquery-chat-ui",
      storage: createJSONStorage(() => localStorage),
      // Only genuine preferences survive a reload. Nothing account-specific is
      // stored any more, so this key is no longer scoped per user.
      partialize: state => ({ sidebarOpen: state.sidebarOpen, draftMode: state.draftMode }),
    },
  ),
)

/** Drops any in-flight answer. Called when the signed-in user changes. */
export function resetChatUIState() {
  useChatStore.setState(IDLE)
}
