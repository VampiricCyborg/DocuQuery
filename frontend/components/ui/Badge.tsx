"use client"
import { cn } from "@/lib/utils"

interface BadgeProps { children: React.ReactNode; variant?: "default" | "success" | "warning" | "error"; className?: string }

const variants = {
  default: "bg-surface-muted text-fg-muted",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  error: "bg-danger-subtle text-danger",
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-medium", variants[variant], className)}>
      {children}
    </span>
  )
}
