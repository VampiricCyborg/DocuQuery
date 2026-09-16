import { FileSearch } from "lucide-react"
import { cn } from "@/lib/utils"

/** DocuQuery wordmark. The mark is neutral (inverse) so the accent stays reserved for actions. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-control bg-fg text-canvas">
        <FileSearch className="size-3.5" />
      </span>
      <span className="text-title-sm font-semibold text-fg">DocuQuery</span>
    </span>
  )
}
