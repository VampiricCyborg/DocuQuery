"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/auth.store"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { useChatStore } from "@/stores/chat.store"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { generateId } from "@/lib/utils"
import type { Conversation } from "@/types"
import { getDefaultChatMode } from "@/stores/settings.store"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // The drawer returns focus here when it closes (browsers don't reliably focus a clicked button).
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/login")
  }, [isAuthenticated, isHydrated, router])

  const { addConversation } = useChatStore()

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      action: () => {
        const conv: Conversation = {
          id: generateId(),
          title: "New Chat",
          messages: [],
          mode: getDefaultChatMode(),
          pinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        addConversation(conv)
        router.push("/chat")
      },
    },
  ])

  if (!isHydrated || !isAuthenticated) return null

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} returnFocusRef={mobileNavTriggerRef} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar mobileNavTriggerRef={mobileNavTriggerRef} onOpenMobileNav={() => setMobileNavOpen(true)} />
        {/* legacy-page: temporary dark ground until the pages themselves move to tokens (Phases 5–9) */}
        <main className="legacy-page flex flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
