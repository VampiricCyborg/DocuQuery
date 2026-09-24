"use client"
import { ChatWindow } from "@/components/chat/ChatWindow"

/**
 * An existing conversation.
 *
 * Renders the same component as /chat and reads nothing from `params`.
 * ChatWindow takes the conversation id from `usePathname()` instead, so that a
 * new chat can adopt its server id mid-stream via `window.history.replaceState`
 * -- which changes the URL without a route transition, and therefore without
 * unmounting the answer being streamed. Both routes render the same tree, so it
 * does not matter which one the browser arrived through.
 *
 * `params` is a Promise in Next.js 16; nothing here needs to await it.
 */
export default function ChatDetailPage() {
  return <ChatWindow />
}
