"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, MessageSquare, Files, Bot, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip } from "@/components/ui/Tooltip"

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/files", icon: Files, label: "Files" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function NavLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-0.5", collapsed ? "items-center" : "px-2 py-2")}>
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href)
        const item = (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            className={cn(
              "flex items-center rounded-control text-body transition-colors focus-ring",
              collapsed ? "size-8 justify-center" : "gap-2 px-2 py-1.5",
              active
                ? "bg-surface-muted font-medium text-fg"
                : "text-fg-muted hover:bg-surface-muted hover:text-fg"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </Link>
        )
        return collapsed
          ? <Tooltip key={href} content={label} side="right">{item}</Tooltip>
          : item
      })}
    </nav>
  )
}
