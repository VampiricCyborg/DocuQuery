import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"
import type { Conversation, Message, ChatMode, Citation } from "@/types"
import { generateId } from "@/lib/utils"
import { chatApi } from "@/services/api"

const CHAT_STORE_KEY = "docuquery-chat-store"

// Saved chats live under a per-user key ("docuquery-chat-store:<userId>"). While nobody is
// signed in, reads return nothing and writes are dropped, so one account's history is never
// loaded into — or overwritten by — another account's session in the same browser.
let storageOwnerId: string | null = null

const userScopedStorage: StateStorage = {
  getItem: name => (storageOwnerId ? localStorage.getItem(`${name}:${storageOwnerId}`) : null),
  setItem: (name, value) => { if (storageOwnerId) localStorage.setItem(`${name}:${storageOwnerId}`, value) },
  removeItem: name => { if (storageOwnerId) localStorage.removeItem(`${name}:${storageOwnerId}`) },
}

const INITIAL_STATE = {
  conversations: [] as Conversation[],
  activeId: null as string | null,
  activeMode: "docuquery" as ChatMode,
  isStreaming: false,
  sidebarOpen: true,
}

interface ChatStore {
  conversations: Conversation[]
  activeId: string | null
  activeMode: ChatMode
  isStreaming: boolean
  sidebarOpen: boolean

  // Conversations
  setConversations: (c: Conversation[]) => void
  setActiveId: (id: string | null) => void
  addConversation: (c: Conversation) => void
  deleteConversation: (id: string) => void
  togglePin: (id: string) => void
  updateTitle: (id: string, title: string) => void

  // Mode
  setMode: (mode: ChatMode) => void

  // Messaging
  sendMessage: (content: string, attachments?: Message["attachments"]) => Promise<void>
  retryLast: () => Promise<void>
  setFeedback: (conversationId: string, messageId: string, feedback: "up" | "down" | null) => void

  // UI
  toggleSidebar: () => void
  activeConversation: () => Conversation | undefined
}

export const useChatStore = create<ChatStore>()(persist((set, get) => ({
      ...INITIAL_STATE,

      setConversations: (conversations) => set({ conversations }),
      setActiveId: (activeId) => set(state => ({
        activeId,
        activeMode: state.conversations.find(c => c.id === activeId)?.mode ?? state.activeMode,
      })),
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setMode: (activeMode) => set(state => ({
        activeMode,
        conversations: state.activeId
          ? state.conversations.map(c => c.id === state.activeId ? { ...c, mode: activeMode } : c)
          : state.conversations,
      })),

      activeConversation: () => {
        const { conversations, activeId } = get()
        return conversations.find(c => c.id === activeId)
      },

      addConversation: (c) =>
        set(s => ({ conversations: [c, ...s.conversations], activeId: c.id, activeMode: c.mode })),

      deleteConversation: (id) =>
        set(s => ({
          conversations: s.conversations.filter(c => c.id !== id),
          activeId: s.activeId === id ? (s.conversations.find(c => c.id !== id)?.id ?? null) : s.activeId,
        })),

      togglePin: (id) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id ? { ...c, pinned: !c.pinned } : c
          ),
        })),

      updateTitle: (id, title) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id ? { ...c, title } : c
          ),
        })),

      setFeedback: (conversationId, messageId, feedback) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === messageId ? { ...m, feedback } : m
                  ),
                }
              : c
          ),
        })),

      sendMessage: async (content, attachments) => {
        const { activeId, conversations } = get()
        if (!activeId) return
        const conversation = conversations.find(c => c.id === activeId)
        const mode = conversation?.mode ?? get().activeMode

        const userMsg: Message = {
          id: generateId(),
          role: "user",
          content,
          status: "done",
          timestamp: new Date().toISOString(),
          attachments,
        }
        const aiMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: "",
          status: "streaming",
          timestamp: new Date().toISOString(),
          citations: [],
        }

        const patchConv = (updater: (c: Conversation) => Conversation) =>
          set(s => ({
            conversations: s.conversations.map(c =>
              c.id === activeId ? updater(c) : c
            ),
          }))

        const addMsg = (msg: Message) =>
          patchConv(c => ({
            ...c,
            messages: [...c.messages, msg],
            updatedAt: new Date().toISOString(),
          }))

        const appendToken = (token: string) =>
          patchConv(c => ({
            ...c,
            messages: c.messages.map(m =>
              m.id === aiMsg.id ? { ...m, content: m.content + token } : m
            ),
          }))

        const setCitations = (citations: Citation[]) =>
          patchConv(c => ({
            ...c,
            messages: c.messages.map(m =>
              m.id === aiMsg.id ? { ...m, citations } : m
            ),
          }))

        const setAiStatus = (status: Message["status"]) =>
          patchConv(c => ({
            ...c,
            messages: c.messages.map(m =>
              m.id === aiMsg.id ? { ...m, status } : m
            ),
          }))

        // Auto-title the conversation from its first user message
        const conv = conversations.find(c => c.id === activeId)
        if (conv && conv.messages.length === 0) {
          get().updateTitle(activeId, content.slice(0, 52).trim() || "New Chat")
        }

        addMsg(userMsg)
        addMsg(aiMsg)
        set({ isStreaming: true })

        try {
          // An `error` event from the server (e.g. the LLM provider is down) marks the answer as failed
          // instead of leaving an empty "done" message.
          let serverError = false
          for await (const event of chatApi.stream(content, activeId, mode)) {
            if (event.type === "error") {
              serverError = true
            } else if (event.type === "token") {
              appendToken(event.data)
            } else if (event.type === "citations") {
              // Map CitationOut → Citation (same shape, just normalizing)
              setCitations(
                event.data.map(c => ({
                  document_id: c.document_id,
                  filename: c.filename,
                  page: c.page,
                  chunk_index: c.chunk_index,
                  source_type: c.source_type,
                  title: c.title,
                  url: c.url,
                }))
              )
            }
          }
          setAiStatus(serverError ? "error" : "done")
        } catch {
          setAiStatus("error")
        } finally {
          set({ isStreaming: false })
        }
      },

      retryLast: async () => {
        const { activeId } = get()
        if (!activeId) return
        const conv = get().activeConversation()
        if (!conv) return
        const lastUser = [...conv.messages].reverse().find(m => m.role === "user")
        if (!lastUser) return
        // Remove the last AI message then resend
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === activeId
              ? { ...c, messages: c.messages.slice(0, -1) }
              : c
          ),
        }))
        await get().sendMessage(lastUser.content)
      },
  }), {
    name: CHAT_STORE_KEY,
    storage: createJSONStorage(() => userScopedStorage),
    // Nothing is loaded until a user is known — see bindChatStoreToUser.
    skipHydration: true,
    partialize: state => ({
      conversations: state.conversations,
      activeId: state.activeId,
      activeMode: state.activeMode,
      sidebarOpen: state.sidebarOpen,
    }),
  }))

/**
 * Points the chat store at one user's saved history. The in-memory state is always cleared
 * first (with storage detached, so the reset is not saved over the previous user's history);
 * passing null leaves it empty and detached. Chats saved before storage was per-user have no
 * known owner: `adoptLegacyChats` assigns them to this user, otherwise they are discarded.
 */
export async function bindChatStoreToUser(userId: string | null, { adoptLegacyChats = false } = {}) {
  storageOwnerId = null
  useChatStore.setState(INITIAL_STATE)
  if (!userId) return
  migrateLegacyChats(userId, adoptLegacyChats)
  storageOwnerId = userId
  await useChatStore.persist.rehydrate()
}

function migrateLegacyChats(userId: string, adopt: boolean) {
  try {
    const legacy = localStorage.getItem(CHAT_STORE_KEY)
    if (legacy === null) return
    const userKey = `${CHAT_STORE_KEY}:${userId}`
    if (adopt && localStorage.getItem(userKey) === null) localStorage.setItem(userKey, legacy)
    localStorage.removeItem(CHAT_STORE_KEY)
  } catch { /* storage unavailable (private mode, blocked) — nothing to migrate */ }
}
