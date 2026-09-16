"use client"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuthStore } from "@/stores/auth.store"
import { Avatar } from "@/components/ui/Avatar"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

// Radix sets data-highlighted for both pointer hover and keyboard focus.
const itemClass = "flex cursor-pointer select-none items-center gap-2 rounded-control px-2 py-1.5 outline-none transition-colors data-[highlighted]:bg-surface-muted"

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  if (!user) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Open profile menu"
          className={compact
            ? "rounded-full p-1 transition-colors hover:bg-surface-muted focus-ring"
            : "flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-muted focus-ring-inset"}
        >
          <Avatar name={user.name} src={user.avatar} size="sm" />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-fg">{user.name}</span>
              <span className="block truncate text-caption text-fg-subtle">{user.email}</span>
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={compact ? "bottom" : "top"}
          align={compact ? "end" : "start"}
          sideOffset={6}
          className="z-50 w-56 rounded-card bg-surface-raised p-1 text-body text-fg shadow-overlay data-[state=open]:animate-fade-in"
        >
          {[
            { icon: User, label: "Profile", action: () => router.push("/profile") },
            { icon: Settings, label: "Settings", action: () => router.push("/settings") },
          ].map(({ icon: Icon, label, action }) => (
            <DropdownMenu.Item key={label} onSelect={action} className={itemClass}>
              <Icon className="size-4 text-fg-subtle" aria-hidden="true" />{label}
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-micro font-medium text-fg-subtle">Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme} onValueChange={setTheme}>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem key={value} value={value} className={itemClass}>
                <Icon className="size-4 text-fg-subtle" aria-hidden="true" />
                {label}
                <DropdownMenu.ItemIndicator className="ml-auto">
                  <Check className="size-4 text-accent-strong" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={() => { void logout(); router.push("/login") }}
            className={cn(itemClass, "text-danger data-[highlighted]:bg-danger-subtle")}
          >
            <LogOut className="size-4" aria-hidden="true" />Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
