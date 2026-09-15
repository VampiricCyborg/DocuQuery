"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, FileText, MessageSquare, MessageSquarePlus, Upload, type LucideIcon } from "lucide-react"
import { useAuthStore } from "@/stores/auth.store"
import { useFileStore } from "@/stores/file.store"
import { useChatStore } from "@/stores/chat.store"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Skeleton } from "@/components/ui/Skeleton"
import { FileStatus } from "@/components/file-upload/FileUploadZone"
import { CHAT_MODE_ICONS } from "@/components/chat/modeIcons"
import { CHAT_MODE_META, type ChatMode, type Conversation } from "@/types"
import { cn, formatBytes, formatRelative } from "@/lib/utils"
import { transition } from "@/lib/motion"

const MODES: ChatMode[] = ["docuquery", "llm", "hybrid"]
const RECENT_LIMIT = 5
// Uploads still in flight have no server timestamp yet, and they are the newest items.
const uploadedAtKey = (uploadedAt?: string) => uploadedAt ?? "9999"

const rowClass = "flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted focus-ring-inset"
const linkClass = "inline-flex items-center gap-1 rounded-control text-caption text-fg-muted transition-colors hover:text-fg focus-ring"

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const files = useFileStore(s => s.files)
  const loadFiles = useFileStore(s => s.loadFiles)
  const conversations = useChatStore(s => s.conversations)
  const addConversation = useChatStore(s => s.addConversation)
  const activeMode = useChatStore(s => s.activeMode)
  const router = useRouter()
  const [filesLoaded, setFilesLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    void loadFiles().finally(() => { if (mounted) setFilesLoaded(true) })
    return () => { mounted = false }
  }, [loadFiles])

  const firstName = user?.name?.split(" ")[0] || "there"
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  // Placeholders only while the first request is out; later visits already have the list in the store.
  const filesLoading = !filesLoaded && files.length === 0
  const indexed = files.filter(f => f.status === "ready").length
  const inProgress = files.filter(f => f.status === "uploading" || f.status === "processing").length
  const failed = files.filter(f => f.status === "error").length
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const recentFiles = [...files]
    .sort((a, b) => uploadedAtKey(b.uploadedAt).localeCompare(uploadedAtKey(a.uploadedAt)))
    .slice(0, RECENT_LIMIT)
  const recentChats = [...conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_LIMIT)

  const startChat = (mode: ChatMode = activeMode) => {
    const now = new Date().toISOString()
    const conversation: Conversation = {
      id: crypto.randomUUID(), title: "New Chat", messages: [], mode,
      pinned: false, createdAt: now, updatedAt: now,
    }
    addConversation(conversation)
    router.push("/chat")
  }

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-4 py-6 text-body text-fg sm:px-6 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition.base}
        className="mx-auto max-w-5xl space-y-8"
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-title-lg font-semibold">{greeting}, {firstName}</h1>
            <p className="mt-1 text-fg-muted">What would you like to do today?</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/files"><Upload className="size-4" aria-hidden="true" />Upload documents</Link>
            </Button>
            <Button onClick={() => startChat()}>
              <MessageSquarePlus className="size-4" aria-hidden="true" />New chat
            </Button>
          </div>
        </header>

        <section aria-labelledby="overview-heading">
          <h2 id="overview-heading" className="sr-only">Overview</h2>
          {/* Dividers are per-tile borders (2×2 grid on small screens, one row from lg) — 1px grid gaps
              land on fractional pixels and render some dividers twice as thick */}
          <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-4">
            <Stat label="Documents" value={files.length} hint={`${formatBytes(totalSize)} total`} loading={filesLoading} />
            <Stat
              label="Indexed"
              value={indexed}
              hint={failed ? `${failed} failed` : indexed ? "Ready to query" : "None yet"}
              tone={failed ? "danger" : undefined}
              loading={filesLoading}
              className="border-l"
            />
            <Stat
              label="Processing"
              value={inProgress}
              hint={inProgress ? "Being indexed" : "Nothing queued"}
              loading={filesLoading}
              className="border-t lg:border-t-0 lg:border-l"
            />
            <Stat label="Chats" value={conversations.length} hint="Saved on this device" className="border-t border-l lg:border-t-0" />
          </dl>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel headingId="recent-chats-heading" title="Recent chats" action={<ViewAllLink href="/chat" label="chats" />}>
            {recentChats.length > 0 ? (
              <ul className="divide-y divide-line">
                {recentChats.map(chat => {
                  const ModeIcon = CHAT_MODE_ICONS[chat.mode] ?? MessageSquare
                  return (
                    <li key={chat.id}>
                      <Link href={`/chat/${chat.id}`} className={rowClass}>
                        <ModeIcon className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                        <time dateTime={chat.updatedAt} className="shrink-0 text-caption text-fg-subtle tabular-nums">
                          {formatRelative(chat.updatedAt)}
                        </time>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState icon={MessageSquare} title="No chats yet" description="Start a chat to ask questions about your documents.">
                <Button variant="secondary" size="sm" onClick={() => startChat()}>New chat</Button>
              </EmptyState>
            )}
          </Panel>

          <Panel headingId="recent-documents-heading" title="Recent documents" action={<ViewAllLink href="/files" label="documents" />}>
            {filesLoading ? (
              <div>
                <p className="sr-only">Loading documents…</p>
                <ul aria-hidden="true" className="divide-y divide-line">
                  {Array.from({ length: 3 }, (_, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-3">
                      <Skeleton className="size-4 shrink-0" />
                      <Skeleton className="h-3.5 flex-1" />
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : recentFiles.length > 0 ? (
              <ul className="divide-y divide-line">
                {recentFiles.map(file => (
                  <li key={file.id}>
                    <Link href={`/files?highlight=${file.id}`} className={rowClass}>
                      <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <FileStatus file={file} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={FileText} title="No documents yet" description="Upload a PDF, DOCX, TXT or MD file to start asking questions about it.">
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/files">Upload documents</Link>
                </Button>
              </EmptyState>
            )}
          </Panel>
        </div>

        <section aria-labelledby="start-chat-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 id="start-chat-heading" className="font-medium">Start a chat</h2>
            <Link href="/mode-select" className={linkClass}>
              Compare modes<ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {MODES.map(mode => {
              const meta = CHAT_MODE_META[mode]
              const ModeIcon = CHAT_MODE_ICONS[mode]
              const current = mode === activeMode
              return (
                <li key={mode} className="flex">
                  <button
                    type="button"
                    onClick={() => startChat(mode)}
                    aria-label={`New ${meta.label} chat${current ? ", current mode" : ""}`}
                    aria-describedby={`mode-${mode}-description`}
                    className="group flex w-full items-start gap-3 rounded-card border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-muted focus-ring"
                  >
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-canvas text-fg-muted">
                      <ModeIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{meta.label}</span>
                        {current && <Badge>Current</Badge>}
                      </span>
                      <span id={`mode-${mode}-description`} className="mt-0.5 block text-caption text-fg-muted">
                        {meta.description}
                      </span>
                    </span>
                    <ArrowRight
                      className="mt-1 size-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </motion.div>
    </div>
  )
}

function Stat({ label, value, hint, tone, loading = false, className }: {
  label: string
  value: number
  hint: string
  tone?: "danger"
  loading?: boolean
  className?: string
}) {
  return (
    <div className={cn("min-w-0 border-line px-4 py-3.5", className)}>
      <dt className="text-caption text-fg-muted">{label}</dt>
      {loading ? (
        // Same height as the loaded value and hint, so the strip doesn't jump when data arrives
        <dd className="mt-1.5 space-y-2">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-20" />
          <span className="sr-only">Loading</span>
        </dd>
      ) : (
        <>
          <dd className="mt-1 text-title font-semibold tabular-nums">{value.toLocaleString()}</dd>
          <dd className={cn("mt-0.5 truncate text-caption", tone === "danger" ? "text-danger" : "text-fg-subtle")}>{hint}</dd>
        </>
      )}
    </div>
  )
}

function Panel({ headingId, title, action, children }: {
  headingId: string
  title: string
  action: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
        <h2 id={headingId} className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={linkClass}>
      View all<span className="sr-only"> {label}</span>
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  )
}

function EmptyState({ icon: Icon, title, description, children }: {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <Icon className="size-5 text-fg-subtle" aria-hidden="true" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-fg-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}
