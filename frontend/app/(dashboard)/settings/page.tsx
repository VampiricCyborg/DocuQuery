"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useAuthStore } from "@/stores/auth.store"
import { useSettingsStore } from "@/stores/settings.store"
import { Button } from "@/components/ui/Button"
import { CHAT_MODE_ICONS } from "@/components/chat/modeIcons"
import { CHAT_MODE_META, type ChatMode } from "@/types"
import { cn } from "@/lib/utils"

const sections = ["General", "Appearance", "Chat", "Account"] as const

const MODES: ChatMode[] = ["docuquery", "llm", "hybrid"]

const THEMES: { value: string; label: string; description: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", description: "Light backgrounds", icon: Sun },
  { value: "dark", label: "Dark", description: "Dark backgrounds", icon: Moon },
  { value: "system", label: "System", description: "Follows your device setting", icon: Monitor },
]

export default function SettingsPage() {
  const [section, setSection] = useState<typeof sections[number]>("General")
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const settings = useSettingsStore()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-4 py-6 text-body text-fg sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-title-lg font-semibold">Settings</h1>
          <p className="mt-1 text-fg-muted">Manage your DocuQuery preferences and account.</p>
        </header>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Wraps onto a second row on small screens rather than scrolling sideways, so every section stays visible */}
          <nav aria-label="Settings sections" className="flex flex-wrap gap-1 md:w-40 md:shrink-0 md:flex-col md:flex-nowrap">
            {sections.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setSection(item)}
                aria-current={section === item ? "true" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-control px-2.5 py-1.5 text-left transition-colors focus-ring",
                  section === item ? "bg-surface-muted font-medium text-fg" : "text-fg-muted hover:bg-surface-muted hover:text-fg"
                )}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="@container min-w-0 flex-1 space-y-5">
            {section === "General" && (
              <Panel title="General" description="Choose the mode used when creating a new conversation.">
                <ChoiceGroup
                  legend="Default chat mode"
                  name="default-mode"
                  value={settings.defaultMode}
                  onChange={mode => settings.set("defaultMode", mode as ChatMode)}
                  options={MODES.map(mode => ({
                    value: mode,
                    label: CHAT_MODE_META[mode].label,
                    description: CHAT_MODE_META[mode].description,
                    icon: CHAT_MODE_ICONS[mode],
                  }))}
                />
              </Panel>
            )}

            {section === "Appearance" && (
              <Panel title="Appearance" description="Choose light or dark, or follow your device. The profile menu has the same switch.">
                <ChoiceGroup legend="Theme" name="theme" value={theme ?? "system"} onChange={setTheme} options={THEMES} />
              </Panel>
            )}

            {section === "Chat" && (
              <Panel title="Chat">
                <Switch label="Show citations" checked={settings.showCitations} onChange={v => settings.set("showCitations", v)} />
              </Panel>
            )}

            {section === "Account" && (
              <>
                <Panel title="Account">
                  <dl className="grid gap-4 @lg:grid-cols-2">
                    <Field label="Name" value={user?.name} />
                    <Field label="Email" value={user?.email} />
                    <Field label="Created" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : undefined} />
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => router.push("/profile")}>View profile</Button>
                    <Button variant="secondary" onClick={() => { void logout(); router.push("/login") }}>Sign out</Button>
                  </div>
                </Panel>
                <Panel title="Danger zone" tone="danger">
                  <p className="mb-3 text-fg-muted">
                    Account deletion is permanent and is not available until a verified deletion endpoint is configured.
                  </p>
                  <Button variant="destructive" disabled>Delete account</Button>
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, description, tone, children }: {
  title: string
  description?: string
  tone?: "danger"
  children: React.ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cn("rounded-card border bg-surface", tone === "danger" ? "border-danger" : "border-line")}
    >
      <div className="border-b border-line px-5 py-4">
        <h2 id={headingId} className={cn("font-medium", tone === "danger" && "text-danger")}>{title}</h2>
        {description && <p className="mt-0.5 text-fg-muted">{description}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

/** Radio cards: native radios keep arrow-key navigation and checked state for assistive tech. */
function ChoiceGroup({ legend, name, value, onChange, options }: {
  legend: string
  name: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; description: string; icon: LucideIcon }[]
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2 @xl:grid-cols-3">
        {options.map(option => {
          const checked = option.value === value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-card border p-3 transition-colors",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                checked ? "border-accent ring-1 ring-accent" : "border-line hover:bg-surface-muted"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <Icon className={cn("mt-0.5 size-4 shrink-0", checked ? "text-accent-strong" : "text-fg-muted")} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-medium">{option.label}</span>
                <span className="mt-0.5 block text-caption text-fg-muted">{option.description}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <label htmlFor={id} className="cursor-pointer">{label}</label>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="peer h-5 w-9 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors checked:bg-accent focus-ring"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-on-accent transition-transform peer-checked:translate-x-4"
        />
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 wrap-anywhere">{value ?? "—"}</dd>
    </div>
  )
}
