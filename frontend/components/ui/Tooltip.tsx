"use client"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

export function Tooltip({ children, content, side = "top" }: {
  children: React.ReactNode
  content: string
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={400}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 rounded-control bg-fg px-2 py-1 text-caption text-canvas data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
