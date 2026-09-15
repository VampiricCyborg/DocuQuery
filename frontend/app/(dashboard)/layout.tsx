"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/auth.store"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { CommandPalette } from "@/components/command/CommandPalette"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The drawer returns focus here when it closes (browsers don't reliably focus a clicked button).
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null)
  // Where focus goes when the palette closes: the button that opened it, or whatever had focus for Ctrl+K.
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/login")
  }, [isAuthenticated, isHydrated, router])

  const openPalette = (returnFocusTo?: HTMLElement | null) => {
    paletteReturnFocusRef.current = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setPaletteOpen(true)
  }

  // Ctrl+K toggles the quick-actions palette. Its first result is "New chat", so Ctrl+K then
  // Enter reproduces the previous shortcut (create a conversation and open /chat).
  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      action: () => (paletteOpen ? setPaletteOpen(false) : openPalette()),
    },
  ])

  if (!isHydrated || !isAuthenticated) return null

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        returnFocusRef={mobileNavTriggerRef}
        onOpenCommandPalette={openPalette}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar mobileNavTriggerRef={mobileNavTriggerRef} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex flex-1 overflow-hidden bg-canvas text-fg">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} returnFocusRef={paletteReturnFocusRef} />
    </div>
  )
}
