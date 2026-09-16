import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Register the design-token scales from app/globals.css so tailwind-merge resolves
// conflicts correctly — otherwise it reads `text-body` as a color and drops it
// whenever it is merged with `text-fg`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "body", "body-lg", "title-sm", "title", "title-lg", "display-sm", "display"],
      radius: ["control", "card"],
      shadow: ["overlay", "modal"],
      ease: ["standard"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + "…" : str
}
