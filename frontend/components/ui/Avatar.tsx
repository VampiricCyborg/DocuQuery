"use client"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"

export function Avatar({ src, name, size = "md" }: { src?: string; name?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "size-6 text-micro", md: "size-8 text-caption", lg: "size-10 text-body" }[size]
  const initials = name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"

  return (
    <AvatarPrimitive.Root className={cn("relative flex shrink-0 overflow-hidden rounded-full border border-line", sizeClass)}>
      <AvatarPrimitive.Image src={src} alt={name} className="aspect-square size-full object-cover" />
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center bg-surface-muted font-medium text-fg-muted">
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
