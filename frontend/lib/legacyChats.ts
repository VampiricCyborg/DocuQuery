import { conversationApi, type ImportConversationBody } from "@/services/api"

/**
 * One-time migration of chats saved before conversations lived on the server.
 *
 * The old store wrote a Zustand persist envelope to
 * `docuquery-chat-store:<userId>`. This reads that key, posts its contents to
 * /conversations/import, and deletes the key only after a 2xx -- so a failed or
 * half-finished import can be retried on the next sign-in instead of silently
 * losing the only copy of someone's history.
 *
 * The server validates everything with the same schemas the live routes use and
 * caps the request at 200 conversations, so this file's job is shape-mapping,
 * not trust. Anything unrecognisable is skipped rather than guessed at: these
 * blobs have been written by several versions of the app.
 */

const LEGACY_KEY = "docuquery-chat-store"
const MAX_CONVERSATIONS = 200

type Wire = ImportConversationBody
type WireMessage = Wire["messages"][number]

const MODES = ["docuquery", "llm", "hybrid"] as const
type Mode = (typeof MODES)[number]

function asMode(value: unknown): Mode {
  return MODES.includes(value as Mode) ? (value as Mode) : "docuquery"
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function asMessage(raw: unknown): WireMessage | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>

  // "system" messages were never sent by this app and the server does not accept
  // them; anything that is not a real turn is dropped.
  if (row.role !== "user" && row.role !== "assistant") return null
  if (typeof row.content !== "string" || !row.content.trim()) return null

  // The old store's statuses were UI states. "streaming" and "sending" mean the
  // tab was closed mid-answer, which is exactly what the server calls "partial".
  const status: WireMessage["status"] =
    row.status === "error" ? "error"
      : row.status === "streaming" || row.status === "sending" ? "partial"
      : "complete"

  return {
    role: row.role,
    content: row.content,
    status,
    citations: Array.isArray(row.citations) ? (row.citations as WireMessage["citations"]) : null,
    feedback: row.feedback === "up" || row.feedback === "down" ? row.feedback : null,
    created_at: asIso(row.timestamp),
  }
}

function asConversation(raw: unknown): Wire | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>

  const messages = Array.isArray(row.messages)
    ? row.messages.map(asMessage).filter((m): m is WireMessage => m !== null)
    : []
  // An empty thread is a "New Chat" row the old store created on click. The
  // server skips these too; dropping them here keeps them out of the 200 budget.
  if (messages.length === 0) return null

  const createdAt = asIso(row.createdAt)
  return {
    title: typeof row.title === "string" && row.title.trim() ? row.title.slice(0, 200) : "Imported Chat",
    mode: asMode(row.mode),
    pinned: row.pinned === true,
    created_at: createdAt,
    updated_at: asIso(row.updatedAt) ?? createdAt,
    messages,
  }
}

function readLegacy(userId: string): { key: string; conversations: Wire[] } | null {
  const key = `${LEGACY_KEY}:${userId}`
  let blob: string | null
  try {
    blob = localStorage.getItem(key)
  } catch {
    return null // private mode, or storage blocked
  }
  if (!blob) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(blob)
  } catch {
    // Unreadable. Leave the key alone rather than deleting data we cannot see
    // into -- a human can still recover it from devtools.
    return null
  }

  const state = (parsed as { state?: { conversations?: unknown } })?.state
  const rows = Array.isArray(state?.conversations) ? state.conversations : []

  const conversations = rows
    .map(asConversation)
    .filter((c): c is Wire => c !== null)
    // Newest first, so if there are more than 200 it is the oldest that are lost.
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, MAX_CONVERSATIONS)

  return { key, conversations }
}

/**
 * Import this user's legacy chats, if any. Safe to call on every sign-in.
 *
 * Returns the number imported, or 0 when there was nothing to do.
 */
export async function importLegacyChats(userId: string): Promise<number> {
  const legacy = readLegacy(userId)
  if (!legacy) return 0

  if (legacy.conversations.length === 0) {
    // Nothing worth keeping, but the key is real and parsed cleanly, so clear it.
    try { localStorage.removeItem(legacy.key) } catch { /* nothing to clean up */ }
    return 0
  }

  // Not idempotent server-side: a second successful call would duplicate every
  // thread. The key is therefore removed only after the response is in hand.
  const result = await conversationApi.import(legacy.conversations)

  try {
    localStorage.removeItem(legacy.key)
  } catch { /* the import succeeded; a stuck key only risks a duplicate later */ }

  return result.imported
}
