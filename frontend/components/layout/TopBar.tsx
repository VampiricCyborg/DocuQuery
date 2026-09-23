"use client"
import { usePathname } from "next/navigation"
import { Menu, PanelLeft } from "lucide-react"
import { useChatStore } from "@/stores/chat.store"
import { useActiveConversationId, useConversationList } from "@/hooks/useConversations"
import { Button } from "@/components/ui/Button"
import { Tooltip } from "@/components/ui/Tooltip"
import { UserMenu } from "@/components/sidebar/UserMenu"

export function TopBar({ onOpenMobileNav, mobileNavTriggerRef }: {
  onOpenMobileNav: () => void
  mobileNavTriggerRef: React.Ref<HTMLButtonElement>
}) {
  const { toggleSidebar, sidebarOpen } = useChatStore()
  const pathname = usePathname()
  const activeId = useActiveConversationId()
  const { conversations } = useConversationList()
  // The id comes from the URL, so it is only ever set on a chat page.
  const onChatPage = pathname === "/chat" || pathname.startsWith("/chat/")
  const active = onChatPage ? conversations.find(c => c.id === activeId) : undefined

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas px-3 text-body text-fg">
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          ref={mobileNavTriggerRef}
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
        >
          <Menu className="size-4" aria-hidden="true" />
        </Button>
        {!sidebarOpen && (
          <Tooltip content="Open sidebar">
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="Open sidebar" onClick={toggleSidebar}>
              <PanelLeft className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
        {active && (
          <p className="max-w-xs truncate font-medium">{active.title}</p>
        )}
      </div>
      <UserMenu compact />
    </header>
  )
}
