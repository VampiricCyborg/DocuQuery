"use client"
import { useEffect, useId, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import * as Dialog from "@radix-ui/react-dialog"
import {
  Bot, CornerDownLeft, Files, LayoutDashboard, MessageSquare, MessageSquarePlus,
  Search, Settings, Sparkles, Upload, User, type LucideIcon,
} from "lucide-react"
import { useChatStore } from "@/stores/chat.store"
import { getDefaultChatMode } from "@/stores/settings.store"
import { cn, generateId, truncate } from "@/lib/utils"
import type { Conversation } from "@/types"

type PaletteItem = {
  id: string
  group: (typeof GROUP_ORDER)[number]
  label: string
  icon: LucideIcon
  keywords?: string
  run: () => void
}

const GROUP_ORDER = ["Actions", "Go to", "Chats", "Ask"] as const

const DESTINATIONS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/files", label: "Files", icon: Files },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
]

function createConversation(title = "New Chat"): Conversation {
  const now = new Date().toISOString()
  return { id: generateId(), title, messages: [], mode: getDefaultChatMode(), pinned: false, createdAt: now, updatedAt: now }
}

/**
 * Ctrl+K quick actions. "New chat" is always the first result, so opening the palette and
 * pressing Enter does what Ctrl+K did before: create a conversation and open /chat.
 */
export function CommandPalette({ open, onOpenChange, returnFocusRef }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Element refocused on close (whatever opened the palette); Radix's default applies if it is gone. */
  returnFocusRef: React.RefObject<HTMLElement | null>
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            const target = returnFocusRef.current
            if (target && target.isConnected && target !== document.body) {
              event.preventDefault()
              target.focus()
            }
          }}
          className="fixed inset-x-4 top-16 z-50 mx-auto flex max-w-xl flex-col overflow-hidden rounded-card bg-surface-raised text-body text-fg shadow-modal outline-none data-[state=open]:animate-fade-in sm:top-24"
        >
          <Dialog.Title className="sr-only">Quick actions</Dialog.Title>
          {/* Mounted only while open, so the query and selection reset every time */}
          <PaletteBody onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { conversations, addConversation, setActiveId, sendMessage } = useChatStore()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const listId = useId()

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    const matches = (item: PaletteItem) => {
      const haystack = `${item.label} ${item.keywords ?? ""}`.toLowerCase()
      return q.split(/\s+/).every(word => haystack.includes(word))
    }

    const actions: PaletteItem[] = [
      {
        id: "new-chat", group: "Actions", label: "New chat", icon: MessageSquarePlus, keywords: "create start conversation",
        run: () => { addConversation(createConversation()); router.push("/chat") },
      },
      {
        id: "upload", group: "Actions", label: "Upload documents", icon: Upload, keywords: "files add import",
        run: () => router.push("/files"),
      },
    ]
    const destinations: PaletteItem[] = DESTINATIONS.map(d => ({
      id: `go-${d.href}`, group: "Go to", label: d.label, icon: d.icon, keywords: "go to open page",
      run: () => router.push(d.href),
    }))
    const chats: PaletteItem[] = conversations.map(c => ({
      id: `chat-${c.id}`, group: "Chats", label: c.title, icon: MessageSquare,
      run: () => { setActiveId(c.id); router.push("/chat") },
    }))

    if (!q) return [...actions, ...destinations, ...chats.slice(0, 5)]

    const text = query.trim()
    const ask: PaletteItem = {
      id: "ask", group: "Ask", label: `Ask DocuQuery: “${truncate(text, 60)}”`, icon: Sparkles,
      // Same sequence as the chat welcome screen's suggestions: new conversation, then send.
      run: () => {
        addConversation(createConversation(text.slice(0, 52).trim()))
        router.push("/chat")
        void new Promise(r => setTimeout(r, 0)).then(() => sendMessage(text))
      },
    }
    return [
      ...actions.filter(matches),
      ...destinations.filter(matches),
      ...chats.filter(matches).slice(0, 8),
      ask,
    ]
  }, [query, conversations, addConversation, setActiveId, sendMessage, router])

  const selectedIndex = Math.min(activeIndex, items.length - 1)
  const selectedItem = items[selectedIndex]
  const optionId = (item: PaletteItem) => `${listId}-${item.id}`
  const activeOptionId = selectedItem ? optionId(selectedItem) : undefined

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" })
  }, [activeOptionId])

  const run = (item: PaletteItem) => {
    onClose()
    item.run()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!items.length) return
      const delta = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((selectedIndex + delta + items.length) % items.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (selectedItem) run(selectedItem)
    }
  }

  const groups = GROUP_ORDER
    .map(group => ({ group, entries: items.map((item, index) => ({ item, index })).filter(e => e.item.group === group) }))
    .filter(g => g.entries.length > 0)

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-line px-3">
        <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Search commands and chats"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          value={query}
          onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
          onKeyDown={onKeyDown}
          placeholder="Search commands and chats…"
          className="h-12 min-w-0 flex-1 bg-transparent text-body-lg text-fg outline-none placeholder:text-fg-subtle"
        />
        <kbd className="rounded-control border border-line px-1.5 font-mono text-micro text-fg-subtle">Esc</kbd>
      </div>

      <div id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
        {groups.map(({ group, entries }) => {
          const labelId = `${listId}-group-${group.replace(/\s+/g, "-")}`
          return (
            <div key={group} role="group" aria-labelledby={labelId}>
              <div id={labelId} className="px-2 pt-2 pb-1 text-micro font-medium text-fg-subtle">{group}</div>
              {entries.map(({ item, index }) => {
                const selected = index === selectedIndex
                const Icon = item.icon
                return (
                  <div
                    key={item.id}
                    id={optionId(item)}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => { if (!selected) setActiveIndex(index) }}
                    onClick={() => run(item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-2",
                      selected ? "bg-surface-muted text-fg" : "text-fg-muted"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", selected ? "text-fg" : "text-fg-subtle")} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {selected && <CornerDownLeft className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 border-t border-line px-3 py-2 text-micro text-fg-subtle" aria-hidden="true">
        <span className="flex items-center gap-1">
          <kbd className="rounded-control border border-line px-1 font-mono">↑</kbd>
          <kbd className="rounded-control border border-line px-1 font-mono">↓</kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded-control border border-line px-1 font-mono">Enter</kbd>
          Select
        </span>
      </div>
    </>
  )
}
