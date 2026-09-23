"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"
import { useChatStore } from "@/stores/chat.store"
import { useActiveConversationId, usePatchConversation } from "@/hooks/useConversations"
import { CHAT_MODE_META, type ChatMode } from "@/types"
import { CHAT_MODE_ICONS } from "./modeIcons"
import { cn } from "@/lib/utils"

const MODES: ChatMode[] = ["docuquery", "llm", "hybrid"]
const MENU_WIDTH = 256

export function ModeIndicator({ mode: activeMode }: { mode: ChatMode }) {
  const activeId = useActiveConversationId()
  const setDraftMode = useChatStore(s => s.setDraftMode)
  const patchConversation = usePatchConversation()

  // An open conversation stores its own mode, so changing it is a write. With no
  // conversation yet there is nothing to write to, and the choice is remembered
  // locally until the first message creates one.
  const setMode = useCallback((next: ChatMode) => {
    setDraftMode(next)
    if (activeId) patchConversation.mutate({ id: activeId, mode: next })
  }, [activeId, setDraftMode, patchConversation])

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeIndex = MODES.indexOf(activeMode)
  const meta = CHAT_MODE_META[activeMode]
  const ActiveIcon = CHAT_MODE_ICONS[activeMode]

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight ?? 180
    const top = rect.top >= menuHeight + 8 ? rect.top - menuHeight - 8 : rect.bottom + 8
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
    setPosition({ left, top })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus() }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const next = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + MODES.length) % MODES.length
        setMode(MODES[next])
      }
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(false) }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true) }
  }, [open, activeIndex, setMode])

  const menu = open && mounted ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Chat mode"
      style={{ position: "fixed", left: position.left, top: position.top, width: MENU_WIDTH, zIndex: 100 }}
      className="animate-fade-in rounded-card bg-surface-raised p-1 text-body text-fg shadow-overlay"
    >
      {MODES.map(mode => {
        const m = CHAT_MODE_META[mode]
        const ModeIcon = CHAT_MODE_ICONS[mode]
        const selected = mode === activeMode
        return (
          <button
            key={mode}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => { setMode(mode); setOpen(false); triggerRef.current?.focus() }}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors focus-ring-inset",
              selected ? "bg-surface-muted" : "hover:bg-surface-muted"
            )}
          >
            <ModeIcon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{m.label}</span>
                {selected && <Check className="size-3.5 shrink-0 text-accent-strong" aria-hidden="true" />}
              </span>
              <span className="mt-0.5 block text-caption text-fg-muted">{m.description}</span>
            </span>
          </button>
        )
      })}
    </div>, document.body
  ) : null

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Chat mode: ${meta.label}`}
      onClick={() => setOpen(value => !value)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-2 py-1 text-caption font-medium text-fg transition-colors hover:bg-surface-muted focus-ring",
        open && "bg-surface-muted"
      )}
    >
      <ActiveIcon className="size-3.5 text-fg-muted" aria-hidden="true" />
      {meta.label}
      <ChevronDown className={cn("size-3 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
    </button>
    {menu}
  </>
}
