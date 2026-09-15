"use client"
import { Bot, Check } from "lucide-react"
import type { Agent, ChatMode } from "@/types"
import { CHAT_MODE_ICONS } from "@/components/chat/modeIcons"
import { cn } from "@/lib/utils"

export function AgentCard({ agent, selected = false, onClick }: {
  agent: Agent
  selected?: boolean
  onClick?: () => void
}) {
  const Icon = CHAT_MODE_ICONS[agent.id as ChatMode] ?? Bot
  const descriptionId = `agent-${agent.id}-description`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={agent.name}
      aria-describedby={descriptionId}
      className={cn(
        "flex w-full flex-col items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors hover:bg-surface-muted focus-ring",
        selected ? "border-accent ring-1 ring-accent" : "border-line"
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-control border border-line bg-canvas text-fg-muted">
          <Icon className="size-4" />
        </span>
        {/* aria-pressed already announces the selection */}
        {selected && (
          <span aria-hidden="true" className="inline-flex items-center gap-1 text-caption font-medium text-accent-strong">
            <Check className="size-3.5" />Selected
          </span>
        )}
      </span>
      <span className="block">
        <span className="block font-medium text-fg">{agent.name}</span>
        <span id={descriptionId} className="mt-1 block text-caption text-fg-muted">{agent.description}</span>
      </span>
    </button>
  )
}
