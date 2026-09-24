"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"

import { conversationApi, type ConversationDetailOut, type ConversationOut, type MessageOut } from "@/services/api"
import type { ChatMode, Conversation, ConversationSummary, Message } from "@/types"

export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
}

// --- Wire -> UI ---------------------------------------------------------------

function toSummary(row: ConversationOut): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMessage(row: MessageOut): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    // "complete" is the UI's "done"; "partial" and "error" carry through so the
    // bubble can say the answer was cut short rather than pretending it is whole.
    status: row.status === "complete" ? "done" : row.status,
    timestamp: row.created_at,
    citations: row.citations ?? undefined,
    feedback: row.feedback ?? null,
  }
}

function toConversation(row: ConversationDetailOut): Conversation {
  return { ...toSummary(row), messages: row.messages.map(toMessage) }
}

// --- Reads ---------------------------------------------------------------------

/**
 * The conversation currently on screen, taken from the URL.
 *
 * Read from `usePathname()` rather than from route params on purpose. When a new
 * chat gets its server id mid-stream, the URL is rewritten with
 * `window.history.replaceState` — which Next.js syncs into `usePathname` without
 * navigating, so nothing remounts and the stream survives. A component reading
 * route params would not see that change, because the route did not change.
 */
export function useActiveConversationId(): string | null {
  const pathname = usePathname()
  const match = /^\/chat\/([^/]+)/.exec(pathname)
  return match ? decodeURIComponent(match[1]) : null
}

export function useConversationList() {
  const query = useQuery({
    queryKey: conversationKeys.list(),
    queryFn: async () => (await conversationApi.list()).items.map(toSummary),
  })
  return { ...query, conversations: query.data ?? [] }
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: conversationKeys.detail(id ?? "none"),
    queryFn: async () => toConversation(await conversationApi.get(id!)),
    enabled: !!id,
    // A conversation the caller does not own answers 404; retrying that is just
    // three more 404s.
    retry: false,
  })
}

// --- Writes --------------------------------------------------------------------

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mode: ChatMode) => conversationApi.create(mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKeys.list() }),
  })
}

/**
 * Rename, pin/unpin or switch mode.
 *
 * The list is updated optimistically because pinning is a direct-manipulation
 * gesture: waiting for a round trip before the row moves makes the click feel
 * broken. On failure the previous list is put back and the query refetched.
 */
export function usePatchConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; title?: string; pinned?: boolean; mode?: ChatMode }) =>
      conversationApi.patch(id, changes),

    onMutate: async ({ id, ...changes }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.list() })
      const previous = queryClient.getQueryData<ConversationSummary[]>(conversationKeys.list())
      queryClient.setQueryData<ConversationSummary[]>(conversationKeys.list(), rows =>
        rows?.map(row => (row.id === id ? { ...row, ...changes } : row)),
      )
      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationKeys.list(), context.previous)
      }
    },

    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() })
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conversationApi.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.list() })
      const previous = queryClient.getQueryData<ConversationSummary[]>(conversationKeys.list())
      queryClient.setQueryData<ConversationSummary[]>(conversationKeys.list(), rows =>
        rows?.filter(row => row.id !== id),
      )
      return { previous }
    },

    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationKeys.list(), context.previous)
      }
    },

    onSettled: (_data, _error, id) => {
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() })
    },
  })
}

/** Set or clear a thumb. `feedback: null` clears it. */
export function useMessageFeedback(conversationId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, feedback }: { messageId: string; feedback: "up" | "down" | null }) =>
      conversationApi.setFeedback(conversationId!, messageId, feedback),

    onMutate: async ({ messageId, feedback }) => {
      if (!conversationId) return {}
      const key = conversationKeys.detail(conversationId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Conversation>(key)
      queryClient.setQueryData<Conversation>(key, current =>
        current && {
          ...current,
          messages: current.messages.map(m => (m.id === messageId ? { ...m, feedback } : m)),
        },
      )
      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (conversationId && context?.previous) {
        queryClient.setQueryData(conversationKeys.detail(conversationId), context.previous)
      }
    },

    onSettled: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) })
      }
    },
  })
}
