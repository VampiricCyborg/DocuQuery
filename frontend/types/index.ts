// ─── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  // Subscription plans are not part of the current backend account model.
  plan?: "free" | "pro" | "enterprise"
  createdAt: string
}

// ─── Chat Mode ───────────────────────────────────────────────────────────────
export type ChatMode = "docuquery" | "llm" | "hybrid"

// Mode icons live in components/chat/modeIcons.ts; mode colors are not used (modes share the neutral tokens).
export const CHAT_MODE_META: Record<ChatMode, { label: string; description: string }> = {
  docuquery: {
    label: "DocuQuery",
    description: "Answers grounded in your uploaded documents only",
  },
  llm: {
    label: "LLM",
    description: "General AI conversation — no document retrieval",
  },
  hybrid: {
    label: "Hybrid",
    description: "Documents first, then LLM knowledge to fill gaps",
  },
}

// ─── Citations ────────────────────────────────────────────────────────────────
export interface Citation {
  document_id: string
  filename: string
  page: number
  chunk_index: number
  source_type?: "document" | "web"
  title?: string
  url?: string
}

// ─── Chat ────────────────────────────────────────────────────────────────────
export type MessageRole = "user" | "assistant" | "system"
// "partial" is a server state: the answer was cut short because the client
// disconnected while it was still streaming. It is a real, readable message, so
// it renders normally — with a note saying it is incomplete.
export type MessageStatus = "sending" | "streaming" | "done" | "partial" | "error"

export interface Message {
  id: string
  role: MessageRole
  content: string
  status: MessageStatus
  timestamp: string
  citations?: Citation[]
  attachments?: FileAttachment[]
  toolCalls?: ToolCall[]
  feedback?: "up" | "down" | null
}

/**
 * A conversation as the sidebar list knows it — no messages.
 *
 * The list endpoint is paginated and deliberately does not carry message bodies;
 * loading every thread's full transcript to draw a list of titles is what the
 * old localStorage store effectively did.
 */
export interface ConversationSummary {
  id: string
  title: string
  mode: ChatMode
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface Conversation extends ConversationSummary {
  messages: Message[]
  agentId?: string
}

// ─── Files ───────────────────────────────────────────────────────────────────
export type FileStatus = "uploading" | "processing" | "ready" | "error"
export type FileType = "pdf" | "docx" | "txt" | "image" | "other"

export interface FileAttachment {
  id: string
  name: string
  size: number
  type: FileType
  url?: string
  status: FileStatus
  progress?: number
  uploadedAt?: string
}

// ─── Agents ──────────────────────────────────────────────────────────────────
export type AgentStatus = "idle" | "running" | "error"

export interface Agent {
  id: string
  name: string
  description: string
  icon: string
  status: AgentStatus
  tools: string[]
  color: string
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: "pending" | "running" | "done" | "error"
}

// ─── Voice ───────────────────────────────────────────────────────────────────
export type VoiceState = "idle" | "listening" | "processing" | "speaking"

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface UsageStats {
  messagesUsed: number
  messagesLimit: number
  filesUploaded: number
  filesLimit: number
  tokensUsed: number
  tokensLimit: number
}

export interface ActivityItem {
  id: string
  type: "chat" | "upload" | "agent"
  description: string
  timestamp: string
}
