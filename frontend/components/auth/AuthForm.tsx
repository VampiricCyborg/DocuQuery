import Link from "next/link"
import { cn } from "@/lib/utils"

/** Shared building blocks for the login, signup and forgot-password cards. */

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-title font-semibold">{title}</h1>
      <p className="text-fg-muted">{description}</p>
    </div>
  )
}

export function AuthField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-caption font-medium text-fg">{label}</label>
      {children}
    </div>
  )
}

export function AuthLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-control font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg focus-ring",
        className
      )}
    >
      {children}
    </Link>
  )
}
