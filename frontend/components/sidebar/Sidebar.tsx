"use client"
import { useState, useMemo, useRef, useEffect, useId } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { motion } from "framer-motion"
import { Plus, Search, Pin, Trash2, MessageSquare, ChevronLeft, ChevronRight, Pencil, Check, X, Zap } from "lucide-react"
import { useChatStore } from "@/stores/chat.store"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Tooltip } from "@/components/ui/Tooltip"
import { Logo } from "@/components/brand/Logo"
import { cn, truncate, generateId } from "@/lib/utils"
import { transition } from "@/lib/motion"
import { UserMenu } from "./UserMenu"
import { NavLinks } from "./NavLinks"
import type { Conversation } from "@/types"
import toast from "react-hot-toast"
import Link from "next/link"
import { getDefaultChatMode } from "@/stores/settings.store"
import { useIsApplePlatform } from "@/lib/platform"

// ─── Time grouping helpers ────────────────────────────────────────────────────

type Group = "pinned" | "today" | "yesterday" | "week" | "older"

function getGroup(iso: string): Exclude<Group, "pinned"> {
  const diff = Date.now() - new Date(iso).getTime()
  const h = diff / 3_600_000
  if (h < 24) return "today"
  if (h < 48) return "yesterday"
  if (h < 168) return "week"
  return "older"
}

const GROUP_LABELS: Record<Group, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 Days",
  older: "Older",
}

const GROUP_ORDER: Group[] = ["pinned", "today", "yesterday", "week", "older"]

/** Opens the command palette; `returnFocusTo` is refocused when the palette closes. */
type OpenCommandPalette = (returnFocusTo?: HTMLElement | null) => void

function useNewConversation() {
  const addConversation = useChatStore(s => s.addConversation)
  return () => {
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
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

/**
 * Desktop (md and up): collapsible sidebar driven by the persisted `sidebarOpen` store flag.
 * Mobile: the same panel inside a modal drawer controlled by the layout.
 */
export function Sidebar({ mobileOpen, onMobileOpenChange, returnFocusRef, onOpenCommandPalette }: {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  /** Element that regains focus when the mobile drawer closes (the top bar's menu button). */
  returnFocusRef: React.RefObject<HTMLButtonElement | null>
  onOpenCommandPalette: OpenCommandPalette
}) {
  const { sidebarOpen, toggleSidebar } = useChatStore()
  const handleNew = useNewConversation()
  const closeNavRef = useRef<HTMLButtonElement>(null)
  const isApple = useIsApplePlatform()

  // Close the drawer if the viewport grows past the mobile breakpoint while it is open.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)")
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) onMobileOpenChange(false) }
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [onMobileOpenChange])

  return (
    <>
      {sidebarOpen ? (
        <motion.aside
          aria-label="Sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 256, opacity: 1 }}
          transition={transition.slow}
          className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-line bg-canvas text-body text-fg md:flex"
        >
          <SidebarPanel
            onOpenCommandPalette={onOpenCommandPalette}
            headerAction={
              <Tooltip content="Collapse sidebar">
                <Button variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={toggleSidebar}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
              </Tooltip>
            }
          />
        </motion.aside>
      ) : (
        <aside aria-label="Sidebar" className="hidden h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-canvas py-2 md:flex">
          <Tooltip content="Expand sidebar" side="right">
            <Button variant="ghost" size="icon" aria-label="Expand sidebar" onClick={toggleSidebar}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
          <Tooltip content={`Quick actions (${isApple ? "⌘K" : "Ctrl+K"})`} side="right">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Quick actions"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={event => onOpenCommandPalette(event.currentTarget)}
            >
              <Zap className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
          <Tooltip content="New chat" side="right">
            <Button variant="ghost" size="icon" aria-label="New chat" onClick={handleNew}>
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
          <div className="my-1 h-px w-6 bg-line" />
          <NavLinks collapsed />
        </aside>
      )}

      <Dialog.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            // Start on the close button: the first tabbable (New chat) has a tooltip that would
            // pop open on focus and swallow the first Escape press.
            onOpenAutoFocus={event => { event.preventDefault(); closeNavRef.current?.focus() }}
            onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef.current?.focus() }}
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-canvas text-body text-fg shadow-modal outline-none data-[state=open]:animate-slide-in-left md:hidden"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <SidebarPanel
              onNavigate={() => onMobileOpenChange(false)}
              // The drawer (and its Quick actions button) unmounts when it closes, so the palette
              // hands focus back to the top bar's menu button instead.
              onOpenCommandPalette={() => onOpenCommandPalette(returnFocusRef.current)}
              headerAction={
                <Dialog.Close asChild>
                  <Button ref={closeNavRef} variant="ghost" size="icon" aria-label="Close navigation">
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </Dialog.Close>
              }
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

// ─── SidebarPanel ─────────────────────────────────────────────────────────────

function SidebarPanel({ headerAction, onNavigate, onOpenCommandPalette }: {
  headerAction: React.ReactNode
  onNavigate?: () => void
  onOpenCommandPalette: OpenCommandPalette
}) {
  const { conversations, activeId, setActiveId, deleteConversation, togglePin } = useChatStore()
  const handleNew = useNewConversation()
  const [search, setSearch] = useState("")
  const groupIdPrefix = useId()
  const isApple = useIsApplePlatform()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? conversations.filter(c => c.title.toLowerCase().includes(q))
      : conversations
  }, [conversations, search])

  // Partition into groups
  const grouped = useMemo(() => {
    const map: Partial<Record<Group, Conversation[]>> = {}
    for (const c of filtered) {
      const key: Group = c.pinned ? "pinned" : getGroup(c.updatedAt)
      if (!map[key]) map[key] = []
      map[key]!.push(c)
    }
    return map
  }, [filtered])

  const startNew = () => {
    handleNew()
    onNavigate?.()
  }

  const select = (id: string) => {
    setActiveId(id)
    onNavigate?.()
  }

  const handleDelete = (id: string) => {
    deleteConversation(id)
    toast.success("Chat deleted")
  }

  const openQuickActions = (event: React.MouseEvent<HTMLButtonElement>) => {
    const opener = event.currentTarget
    onNavigate?.()
    onOpenCommandPalette(opener)
  }

  return (
    <>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <Link href="/" aria-label="DocuQuery home" onClick={onNavigate} className="rounded-control focus-ring">
          <Logo />
        </Link>
        <div className="flex items-center gap-0.5">
          <Tooltip content="New chat">
            <Button variant="ghost" size="icon" aria-label="New chat" onClick={startNew}>
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
          {headerAction}
        </div>
      </div>

      {/* Quick actions (command palette) */}
      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={openQuickActions}
          aria-keyshortcuts="Control+K Meta+K"
          className="flex w-full items-center gap-2 rounded-control border border-line bg-surface px-2 py-1.5 text-left text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-ring"
        >
          <Zap className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <span className="flex-1">Quick actions</span>
          <kbd className="rounded-control border border-line bg-surface-muted px-1.5 font-mono text-micro text-fg-subtle">{isApple ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      </div>

      <NavLinks onNavigate={onNavigate} />
      <div className="mx-3 h-px bg-line" />

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <Input
            aria-label="Search chats"
            placeholder="Search chats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-body"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-caption text-fg-subtle">
            <p>No chats yet.</p>
            <button
              type="button"
              onClick={startNew}
              className="mt-1 rounded-control font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg focus-ring-inset"
            >
              Start a new chat
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-caption text-fg-subtle">No matches for &quot;{search}&quot;</p>
        ) : (
          GROUP_ORDER.map(group => {
            const items = grouped[group]
            if (!items?.length) return null
            const labelId = `${groupIdPrefix}-${group}`
            return (
              <div key={group} role="group" aria-labelledby={labelId} className="mb-2">
                <p id={labelId} className="px-2 pt-2 pb-1 text-micro font-medium text-fg-subtle">
                  {GROUP_LABELS[group]}
                </p>
                <div className="space-y-px">
                  {items.map(c => (
                    <ConvItem
                      key={c.id}
                      conv={c}
                      active={c.id === activeId}
                      onSelect={() => select(c.id)}
                      onDelete={() => handleDelete(c.id)}
                      onPin={() => togglePin(c.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      <UserMenu />
    </>
  )
}

// ─── ConvItem ─────────────────────────────────────────────────────────────────

function ConvItem({
  conv, active, onSelect, onDelete, onPin,
}: {
  conv: Conversation
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onPin: () => void
}) {
  const { updateTitle } = useChatStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.select(), 0)
  }, [editing])

  // After leaving rename mode, put keyboard focus back on the row.
  const finishEditing = () => {
    setEditing(false)
    requestAnimationFrame(() => selectRef.current?.focus())
  }

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== conv.title) {
      updateTitle(conv.id, trimmed)
    }
    finishEditing()
  }

  const cancelRename = () => {
    setDraft(conv.title)
    finishEditing()
  }

  const startRename = () => {
    setDraft(conv.title)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-control bg-surface-muted p-1">
        <input
          ref={inputRef}
          aria-label="Chat title"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") commitRename()
            if (e.key === "Escape") cancelRename()
          }}
          className="h-7 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-2 text-body text-fg focus-ring-inset"
        />
        <RowAction label="Save title" onClick={commitRename}>
          <Check aria-hidden="true" />
        </RowAction>
        <RowAction label="Cancel rename" onClick={cancelRename}>
          <X aria-hidden="true" />
        </RowAction>
      </div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transition.base}
      className={cn(
        "group relative rounded-control transition-colors",
        active ? "bg-surface-muted" : "hover:bg-surface-muted focus-within:bg-surface-muted"
      )}
    >
      <button
        ref={selectRef}
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex w-full min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-left focus-ring-inset"
      >
        <MessageSquare className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", active ? "font-medium text-fg" : "text-fg-muted group-hover:text-fg")}>
            {truncate(conv.title, 28)}
          </span>
          <span className="block text-micro text-fg-subtle">{getRelativeLabel(conv.updatedAt)}</span>
        </span>
      </button>

      {/* Row actions: shown on hover, on keyboard focus within the row, and always on touch screens */}
      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-control bg-surface-muted pl-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100">
        <RowAction label="Rename" onClick={startRename}>
          <Pencil aria-hidden="true" />
        </RowAction>
        <RowAction label={conv.pinned ? "Unpin" : "Pin"} onClick={onPin}>
          <Pin className={cn(conv.pinned && "text-accent-strong")} aria-hidden="true" />
        </RowAction>
        <RowAction label="Delete" tone="danger" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
        </RowAction>
      </div>
    </motion.div>
  )
}

function RowAction({ label, tone, onClick, children }: {
  label: string
  tone?: "danger"
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "flex size-6 items-center justify-center rounded-control text-fg-subtle transition-colors focus-ring-inset [&_svg]:size-3.5",
          tone === "danger" ? "hover:bg-danger-subtle hover:text-danger" : "hover:bg-line hover:text-fg"
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function getRelativeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
