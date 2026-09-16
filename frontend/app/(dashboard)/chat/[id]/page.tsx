"use client"
import { use, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useChatStore } from "@/stores/chat.store"
import { ChatWindow } from "@/components/chat/ChatWindow"

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 16 passes params as a Promise; client pages unwrap it with React.use().
  const { id } = use(params)
  const router = useRouter()
  const conversations = useChatStore(s => s.conversations)
  const setActiveId = useChatStore(s => s.setActiveId)
  const known = conversations.some(conversation => conversation.id === id)

  useEffect(() => {
    // An id that isn't in this account's history (a stale link, or a chat deleted in
    // another tab) falls back to /chat rather than showing an empty conversation.
    if (!known) {
      router.replace("/chat")
      return
    }
    // setActiveId also switches activeMode to this conversation's mode.
    setActiveId(id)
  }, [id, known, router, setActiveId])

  return <ChatWindow />
}
