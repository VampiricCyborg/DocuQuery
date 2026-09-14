"use client"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"
import { forwardRef } from "react"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent hover:bg-accent-hover",
        ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg",
        outline: "border border-line text-fg hover:bg-surface-muted",
        destructive: "border border-transparent bg-danger-subtle text-danger hover:border-danger",
        secondary: "border border-line bg-surface text-fg hover:bg-surface-muted",
      },
      size: {
        sm: "h-7 px-2.5 text-caption",
        md: "h-9 px-3.5 text-body",
        lg: "h-10 px-4 text-body-lg",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  }
)
Button.displayName = "Button"
