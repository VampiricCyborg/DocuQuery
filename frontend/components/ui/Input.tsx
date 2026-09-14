import { cn } from "@/lib/utils"
import { forwardRef } from "react"

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-body-lg text-fg transition-colors placeholder:text-fg-subtle focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"
