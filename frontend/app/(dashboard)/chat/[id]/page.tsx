"use client"
import { use, useEffect } from "react"
import { useChatStore } from "@/stores/chat.store"
import { ChatWindow } from "@/components/chat/ChatWindow"
import { MOCK_CONVERSATIONS } from "@/services/mock"

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 16 passes params as a Promise; client pages unwrap it with React.use().
  const { id } = use(params)
  const { conversations, setConversations, setActiveId } = useChatStore()

  useEffect(() => {
    if (!conversations.some(conversation => conversation.id === id)) {
      const conversation = MOCK_CONVERSATIONS.find(item => item.id === id)
      if (conversation) setConversations([...conversations, conversation])
    }
    // setActiveId also switches activeMode to this conversation's mode.
    setActiveId(id)
  }, [id, conversations, setActiveId, setConversations])

  return <ChatWindow />
}
