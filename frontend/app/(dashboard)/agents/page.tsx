"use client"
import { useQuery } from "@tanstack/react-query"
import { agentService } from "@/services/mock"
import { AgentCard } from "@/components/agents/AgentCard"
import { useUIStore } from "@/stores/ui.store"
import { Skeleton } from "@/components/ui/Skeleton"
import { useChatStore } from "@/stores/chat.store"
import type { ChatMode } from "@/types"

export default function AgentsPage() {
  const { data: sourceAgents = [], isLoading } = useQuery({ queryKey: ["agents"], queryFn: agentService.getAgents })
  const agents = sourceAgents.slice(0, 3).map((agent, index) => ({
    ...agent,
    id: (["docuquery", "llm", "hybrid"] as const)[index],
    name: (["DocuQuery", "LLM", "Hybrid"] as const)[index],
    description: (["Ask questions grounded in your uploaded documents.", "General AI conversations and open-ended questions.", "Combine document context with AI reasoning."] as const)[index],
  }))
  const { selectedAgent, setSelectedAgent } = useUIStore()
  const setMode = useChatStore(s => s.setMode)

  const chooseAgent = (agent: typeof agents[number]) => {
    const selecting = selectedAgent?.id !== agent.id
    setSelectedAgent(selecting ? agent : null)
    if (selecting && ["docuquery", "llm", "hybrid"].includes(agent.id)) setMode(agent.id as ChatMode)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-4 py-6 text-body text-fg sm:px-6 sm:py-8">
      {/* Columns follow the content width, which changes with the sidebar, not the window */}
      <div className="@container mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-title-lg font-semibold">AI Agents</h1>
          <p className="mt-1 text-fg-muted">Select an agent to power your conversations</p>
        </header>
        {isLoading ? (
          <div className="grid gap-3 @2xl:grid-cols-3">
            <p className="sr-only">Loading agents…</p>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}
          </div>
        ) : (
          <ul className="grid gap-3 @2xl:grid-cols-3">
            {agents.map(agent => (
              <li key={agent.id} className="flex">
                <AgentCard
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  onClick={() => chooseAgent(agent)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
