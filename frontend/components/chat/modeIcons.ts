import { Bot, Brain, Zap, type LucideIcon } from "lucide-react"
import type { ChatMode } from "@/types"

/** Line icons for the chat modes; used in the chat UI in place of the emoji in CHAT_MODE_META. */
export const CHAT_MODE_ICONS: Record<ChatMode, LucideIcon> = {
  docuquery: Zap,
  llm: Bot,
  hybrid: Brain,
}
