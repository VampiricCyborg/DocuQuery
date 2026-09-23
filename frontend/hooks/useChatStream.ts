"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import toast from "react-hot-toast"

import { chatApi, ChatRequestError } from "@/services/api"
import { useChatStore } from "@/stores/chat.store"
import type { ChatMode } from "@/types"
import { conversationKeys, useActiveConversationId } from "./useConversations"

/**
 * Sends a message and streams the answer.
 *
 * The streamed text lands in the chat UI store, not the query cache: it is not
 * server state yet. When the stream ends the conversation query is refetched and
 * the buffer is dropped, so what stays on screen is the row the server actually
 * stored — including its real message id, which is what feedback and retry need.
 */
export function useChatStream() {
  const queryClient = useQueryClient()
  const activeId = useActiveConversationId()

  const beginStream = useChatStore(s => s.beginStream)
  const attachStreamConversation = useChatStore(s => s.attachStreamConversation)
  const appendStreamToken = useChatStore(s => s.appendStreamToken)
  const setStreamCitations = useChatStore(s => s.setStreamCitations)
  const failStream = useChatStore(s => s.failStream)
  const endStream = useChatStore(s => s.endStream)
  const isStreaming = useChatStore(s => s.streamStatus === "streaming")

  const run = useCallback(
    async (args: {
      message: string
      conversationId: string | null
      mode: ChatMode
      regenerate?: boolean
    }) => {
      const { message, mode, regenerate = false } = args
      let conversationId = args.conversationId

      beginStream({ conversationId, userText: message, isRetry: regenerate })

      let failed = false
      try {
        for await (const event of chatApi.stream(message, conversationId ?? undefined, mode, {
          regenerate,
        })) {
          if (event.type === "conversation") {
            conversationId = event.data
            attachStreamConversation(conversationId)

            // Put the new id in the URL without navigating. `router.replace`
            // would move from /chat to /chat/[id] -- a different route, so the
            // page unmounts and the answer being streamed into it disappears
            // mid-sentence. Next.js supports the History API directly and syncs
            // it into usePathname, which is what useActiveConversationId reads.
            window.history.replaceState(null, "", `/chat/${conversationId}`)

            // The thread now exists server-side; show it in the sidebar at once.
            queryClient.invalidateQueries({ queryKey: conversationKeys.list() })
          } else if (event.type === "token") {
            appendStreamToken(event.data)
          } else if (event.type === "citations") {
            setStreamCitations(event.data)
          } else if (event.type === "error") {
            failed = true
          }
        }
      } catch (error) {
        failed = true
        if (error instanceof ChatRequestError && error.status === 404) {
          // The thread was deleted in another tab, or never belonged to us.
          toast.error("That chat is no longer available.")
          queryClient.invalidateQueries({ queryKey: conversationKeys.list() })
        } else {
          toast.error("Could not reach DocuQuery. Please try again.")
        }
      }

      if (failed) {
        failStream()
      }

      if (conversationId) {
        // Await the refetch before clearing the buffer, so the streamed text is
        // replaced by the stored message in one step rather than blanking first.
        await queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) })
        queryClient.invalidateQueries({ queryKey: conversationKeys.list() })
      }

      if (!failed) endStream()
    },
    [
      beginStream, attachStreamConversation, appendStreamToken,
      setStreamCitations, failStream, endStream, queryClient,
    ],
  )

  /** Send a new message. `conversationId` omitted starts a new conversation. */
  const send = useCallback(
    (message: string, mode: ChatMode, conversationId: string | null = activeId) =>
      run({ message, conversationId, mode }),
    [run, activeId],
  )

  /**
   * Re-answer the last question.
   *
   * The server drops its previous answer and writes a new one in place, so the
   * thread does not grow a duplicate turn. The message text is not sent: /chat
   * reads the question from its own records.
   */
  const retry = useCallback(
    (conversationId: string, mode: ChatMode) =>
      run({ message: "", conversationId, mode, regenerate: true }),
    [run],
  )

  return { send, retry, isStreaming }
}
