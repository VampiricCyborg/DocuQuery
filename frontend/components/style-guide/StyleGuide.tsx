"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { AnimatePresence, motion } from "framer-motion"
import {
  Check, ChevronDown, FileText, MessageSquare, Monitor, Moon, Search,
  Settings, Sparkles, Sun, Upload, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"

// ─── Token catalogue ──────────────────────────────────────────────────────────
// Class names are written out in full so Tailwind can detect them at build time.

type ColorToken = { token: string; className: string; note: string }

const COLOR_GROUPS: { title: string; tokens: ColorToken[] }[] = [
  {
    title: "Surfaces",
    tokens: [
      { token: "canvas", className: "bg-canvas", note: "Page background" },
      { token: "surface", className: "bg-surface", note: "Cards, inputs, panels" },
      { token: "surface-raised", className: "bg-surface-raised", note: "Menus, popovers, dialogs" },
      { token: "surface-muted", className: "bg-surface-muted", note: "Hover rows, subtle fills, active nav" },
    ],
  },
  {
    title: "Lines",
    tokens: [
      { token: "line", className: "bg-line", note: "Hairline separators (decorative)" },
      { token: "line-strong", className: "bg-line-strong", note: "Form-control boundaries" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { token: "fg", className: "bg-fg", note: "Primary text" },
      { token: "fg-muted", className: "bg-fg-muted", note: "Secondary text" },
      { token: "fg-subtle", className: "bg-fg-subtle", note: "Placeholders, timestamps" },
    ],
  },
  {
    title: "Accent",
    tokens: [
      { token: "accent", className: "bg-accent", note: "Primary action fill" },
      { token: "accent-hover", className: "bg-accent-hover", note: "Primary action hover" },
      { token: "on-accent", className: "bg-on-accent", note: "Text on accent fills" },
      { token: "accent-strong", className: "bg-accent-strong", note: "Accent text and icons" },
      { token: "accent-subtle", className: "bg-accent-subtle", note: "Selected and highlighted rows" },
      { token: "ring", className: "bg-ring", note: "Focus-visible outline" },
    ],
  },
  {
    title: "Status",
    tokens: [
      { token: "danger", className: "bg-danger", note: "Errors, destructive actions" },
      { token: "danger-subtle", className: "bg-danger-subtle", note: "Error backgrounds" },
      { token: "success", className: "bg-success", note: "Indexed, completed" },
      { token: "success-subtle", className: "bg-success-subtle", note: "Success backgrounds" },
      { token: "warning", className: "bg-warning", note: "Processing, pending" },
      { token: "warning-subtle", className: "bg-warning-subtle", note: "Warning backgrounds" },
    ],
  },
  {
    title: "Overlay",
    tokens: [{ token: "scrim", className: "bg-scrim", note: "Backdrop behind dialogs" }],
  },
]

const ALL_COLOR_TOKENS = COLOR_GROUPS.flatMap(group => group.tokens.map(t => t.token))

const TEXT_TOKENS = [
  { token: "fg", className: "text-fg" },
  { token: "fg-muted", className: "text-fg-muted" },
  { token: "fg-subtle", className: "text-fg-subtle" },
  { token: "accent-strong", className: "text-accent-strong" },
  { token: "danger", className: "text-danger" },
  { token: "success", className: "text-success" },
  { token: "warning", className: "text-warning" },
]

const BACKGROUND_TOKENS = [
  { token: "canvas", className: "bg-canvas" },
  { token: "surface", className: "bg-surface" },
  { token: "surface-raised", className: "bg-surface-raised" },
  { token: "surface-muted", className: "bg-surface-muted" },
]

const FILL_PAIRS = [
  { fg: "on-accent", bg: "accent", className: "bg-accent text-on-accent", label: "Primary action" },
  { fg: "on-accent", bg: "accent-hover", className: "bg-accent-hover text-on-accent", label: "Primary hover" },
  { fg: "canvas", bg: "fg", className: "bg-fg text-canvas", label: "Inverse" },
  { fg: "accent-strong", bg: "accent-subtle", className: "bg-accent-subtle text-accent-strong", label: "Selected" },
  { fg: "danger", bg: "danger-subtle", className: "bg-danger-subtle text-danger", label: "Failed" },
  { fg: "success", bg: "success-subtle", className: "bg-success-subtle text-success", label: "Indexed" },
  { fg: "warning", bg: "warning-subtle", className: "bg-warning-subtle text-warning", label: "Processing" },
]

const NON_TEXT_TOKENS = ["line-strong", "ring", "accent"]

const TYPE_SCALE = [
  { token: "display", className: "text-display font-semibold", spec: "56 / 56 · −0.03em", use: "Landing hero", sample: "Ask your documents." },
  { token: "display-sm", className: "text-display-sm font-semibold", spec: "36 / 40 · −0.024em", use: "Landing sections", sample: "Grounded answers, cited." },
  { token: "title-lg", className: "text-title-lg font-semibold", spec: "24 / 32 · −0.019em", use: "Page titles", sample: "Documents" },
  { token: "title", className: "text-title font-semibold", spec: "20 / 28 · −0.016em", use: "Dialog titles", sample: "Upload documents" },
  { token: "title-sm", className: "text-title-sm font-semibold", spec: "16 / 24 · −0.011em", use: "Section headings", sample: "Recent conversations" },
  { token: "body-lg", className: "text-body-lg", spec: "14 / 22", use: "Chat answers, forms", sample: "Revenue grew 23% year over year, driven by enterprise renewals." },
  { token: "body", className: "text-body", spec: "13 / 20", use: "Default UI text", sample: "Q3_Report_2024.pdf · 42 chunks · indexed" },
  { token: "caption", className: "text-caption", spec: "12 / 16", use: "Metadata, labels", sample: "Updated 2 minutes ago" },
  { token: "micro", className: "text-micro", spec: "11 / 16", use: "Badges, shortcuts", sample: "CTRL K" },
]

const SPACING = [
  { px: 4, className: "w-1" },
  { px: 8, className: "w-2" },
  { px: 12, className: "w-3" },
  { px: 16, className: "w-4" },
  { px: 24, className: "w-6" },
  { px: 32, className: "w-8" },
  { px: 48, className: "w-12" },
  { px: 64, className: "w-16" },
]

const ICONS = [
  ["file", FileText], ["message", MessageSquare], ["search", Search], ["upload", Upload], ["settings", Settings],
  ["sparkles", Sparkles], ["check", Check], ["chevron", ChevronDown], ["close", X],
] as const

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

// ─── Live token values ────────────────────────────────────────────────────────

function subscribeToThemeChanges(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })
  return () => observer.disconnect()
}

function readColorTokens() {
  const styles = getComputedStyle(document.documentElement)
  return ALL_COLOR_TOKENS.map(token => styles.getPropertyValue(`--color-${token}`).trim()).join(",")
}

function useColorTokens(): Record<string, string> {
  const snapshot = useSyncExternalStore(subscribeToThemeChanges, readColorTokens, () => "")
  return useMemo(() => {
    const values = snapshot.split(",")
    return Object.fromEntries(ALL_COLOR_TOKENS.map((token, i) => [token, values[i] ?? ""]))
  }, [snapshot])
}

const noopSubscribe = () => () => {}

function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Expands #rgb to #rrggbb (the CSS minifier shortens #ffffff to #fff); rejects alpha and non-hex values. */
function normalizeHex(value?: string) {
  const hex = value?.trim().toLowerCase()
  if (!hex) return undefined
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map(c => c + c).join("")}`
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : undefined
}

function contrast(a?: string, b?: string) {
  const [x, y] = [normalizeHex(a), normalizeHex(b)]
  if (!x || !y) return null
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StyleGuide() {
  const values = useColorTokens()

  return (
    <div className="min-h-screen bg-canvas px-4 py-10 text-body text-fg sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
          <div>
            <p className="text-caption font-medium text-fg-subtle">DocuQuery design system</p>
            <h1 className="mt-1 text-title-lg font-semibold">Design tokens</h1>
            <p className="mt-2 max-w-xl text-body-lg text-fg-muted">
              Every color, type, spacing, radius, elevation, motion and icon token, rendered in the active theme.
              Switch themes to review both value sets.
            </p>
          </div>
          <ThemeSwitcher />
        </header>

        <Section id="color" title="Color" description="Neutral-first. The accent is reserved for primary actions and active states; status colors only communicate state.">
          <div className="space-y-8">
            {COLOR_GROUPS.map(group => (
              <div key={group.title}>
                <h3 className="mb-3 text-caption font-medium text-fg-muted">{group.title}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.tokens.map(t => (
                    <div key={t.token} className="overflow-hidden rounded-card border border-line bg-surface">
                      <div className={cn("h-14 border-b border-line", t.className)} />
                      <div className="p-3">
                        <p className="font-medium">{t.token}</p>
                        <p className="font-mono text-caption text-fg-muted">{normalizeHex(values[t.token]) ?? (values[t.token] || "—")}</p>
                        <p className="mt-1 text-caption text-fg-subtle">{t.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="contrast" title="Contrast" description="Ratios are computed live from the active theme. Text pairs need 4.5:1 (WCAG AA); form-control boundaries, focus rings and accent fills need 3:1.">
          <div className="space-y-8">
            <div className="overflow-x-auto rounded-card border border-line">
              <table className="w-full min-w-2xl border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    <th scope="col" className="px-3 py-2 text-caption font-medium text-fg-muted">Text</th>
                    {BACKGROUND_TOKENS.map(bg => (
                      <th key={bg.token} scope="col" className="px-3 py-2 font-mono text-caption font-medium text-fg-muted">{bg.token}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEXT_TOKENS.map(text => (
                    <tr key={text.token} className="border-b border-line last:border-0">
                      <th scope="row" className="bg-surface px-3 py-2 font-mono text-caption font-medium">{text.token}</th>
                      {BACKGROUND_TOKENS.map(bg => (
                        <td key={bg.token} className={cn("px-3 py-2", bg.className)}>
                          <span className={cn("font-medium", text.className)}>Aa</span>
                          <Ratio value={contrast(values[text.token], values[bg.token])} min={4.5} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FILL_PAIRS.map(pair => (
                <div key={pair.label} className="rounded-card border border-line bg-surface p-3">
                  <span className={cn("inline-flex rounded-control px-2.5 py-1 font-medium", pair.className)}>{pair.label}</span>
                  <p className="mt-2 font-mono text-caption text-fg-muted">{pair.fg} on {pair.bg}</p>
                  <Ratio value={contrast(values[pair.fg], values[pair.bg])} min={4.5} block />
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-card border border-line">
              <table className="w-full min-w-2xl border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    <th scope="col" className="px-3 py-2 text-caption font-medium text-fg-muted">Non-text (3:1)</th>
                    {BACKGROUND_TOKENS.map(bg => (
                      <th key={bg.token} scope="col" className="px-3 py-2 font-mono text-caption font-medium text-fg-muted">{bg.token}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NON_TEXT_TOKENS.map(token => (
                    <tr key={token} className="border-b border-line last:border-0">
                      <th scope="row" className="bg-surface px-3 py-2 font-mono text-caption font-medium">{token}</th>
                      {BACKGROUND_TOKENS.map(bg => (
                        <td key={bg.token} className={cn("px-3 py-2", bg.className)}>
                          <Ratio value={contrast(values[token], values[bg.token])} min={3} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section id="type" title="Typography" description="Inter, loaded with next/font. Dense 13px UI text; display sizes only in marketing contexts. Three weights: regular, medium, semibold.">
          <div className="rounded-card border border-line bg-surface px-4">
            {TYPE_SCALE.map(t => (
              <div key={t.token} className="flex flex-col gap-2 border-b border-line py-4 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
                <div className="shrink-0 sm:w-40">
                  <p className="font-mono text-caption">text-{t.token}</p>
                  <p className="text-caption text-fg-subtle">{t.spec} · {t.use}</p>
                </div>
                <p className={cn("min-w-0 truncate", t.className)}>{t.sample}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-body-lg">
            <span className="font-normal">Regular 400</span>
            <span className="font-medium">Medium 500</span>
            <span className="font-semibold">Semibold 600</span>
          </div>
        </Section>

        <Section id="spacing" title="Spacing" description="4px base unit (Tailwind's spacing scale). Generous padding between sections, tight spacing inside dense lists.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              {SPACING.map(s => (
                <div key={s.px} className="flex items-center gap-3">
                  <span className="w-10 text-right font-mono text-caption text-fg-muted">{s.px}px</span>
                  <span className={cn("h-3 rounded-sm bg-fg-subtle", s.className)} />
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {[
                { name: "Q3_Report_2024.pdf", meta: "2.4 MB", status: "Indexed", tone: "bg-success-subtle text-success" },
                { name: "Board_Minutes_Sept.docx", meta: "840 KB", status: "Processing", tone: "bg-warning-subtle text-warning" },
                { name: "Vendor_Contract_v3.pdf", meta: "1.1 MB", status: "Failed", tone: "bg-danger-subtle text-danger" },
              ].map(row => (
                <div key={row.name} className="flex items-center gap-3 border-b border-line px-3 py-2 transition-colors last:border-0 hover:bg-surface-muted">
                  <FileText className="size-4 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="text-caption text-fg-subtle">{row.meta}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-micro font-medium", row.tone)}>{row.status}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section id="shape" title="Radius" description="Small and consistent. Controls 6px, containers 8px; full rounding only for avatars and status pills.">
          <div className="flex flex-wrap gap-6">
            {[
              { label: "rounded-control · 6px", className: "rounded-control" },
              { label: "rounded-card · 8px", className: "rounded-card" },
              { label: "rounded-full", className: "rounded-full" },
            ].map(r => (
              <div key={r.label} className="flex flex-col items-center gap-2">
                <div className={cn("size-16 border border-line-strong bg-surface-muted", r.className)} />
                <span className="font-mono text-caption text-fg-muted">{r.label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="elevation" title="Elevation" description="Surfaces are separated with 1px borders. Shadows are reserved for true overlays: menus, popovers, dialogs, the command palette.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="font-medium">Border</p>
              <p className="mt-1 text-caption text-fg-muted">Cards and panels</p>
            </div>
            <div className="rounded-card bg-surface-raised p-4 shadow-overlay">
              <p className="font-medium">shadow-overlay</p>
              <p className="mt-1 text-caption text-fg-muted">Menus, popovers</p>
            </div>
            <div className="rounded-card bg-surface-raised p-4 shadow-modal">
              <p className="font-medium">shadow-modal</p>
              <p className="mt-1 text-caption text-fg-muted">Dialogs, palette</p>
            </div>
            <div className="relative h-24 overflow-hidden rounded-card border border-line bg-canvas">
              <div className="absolute inset-0 bg-scrim" />
              <div className="absolute inset-x-3 top-3 rounded-card bg-surface-raised p-3 shadow-modal">
                <p className="font-medium">Dialog on scrim</p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="motion" title="Motion" description="120–180ms with a standard ease-out curve. No springs, no bounce. Hover each button to compare durations.">
          <MotionDemo />
        </Section>

        <Section id="icons" title="Icons" description="Lucide line icons only, one stroke weight (--icon-stroke-width). 16px in dense UI, 14px inline with captions, 20px for empty states.">
          <div className="flex flex-wrap items-center gap-5 text-fg-muted [&_svg]:[stroke-width:var(--icon-stroke-width)]">
            {ICONS.map(([name, Icon]) => (
              <Icon key={name} className="size-4" aria-hidden="true" />
            ))}
            <span className="h-4 w-px bg-line" />
            <FileText className="size-3.5" aria-hidden="true" />
            <FileText className="size-4" aria-hidden="true" />
            <FileText className="size-5" aria-hidden="true" />
          </div>
        </Section>

        <Section id="states" title="Interaction states" description="Token compositions for hover, focus and disabled states. Tab through to check the focus ring. These are previews; the shared Button and Input components adopt them in Phase 2.">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-control bg-accent px-3 font-medium text-on-accent transition-colors hover:bg-accent-hover focus-ring">
                <Upload className="size-4" aria-hidden="true" /> Upload
              </button>
              <button type="button" className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 font-medium transition-colors hover:bg-surface-muted focus-ring">
                Secondary
              </button>
              <button type="button" className="inline-flex h-8 items-center rounded-control bg-fg px-3 font-medium text-canvas transition-colors hover:bg-fg/90 focus-ring">
                Inverse
              </button>
              <button type="button" className="inline-flex h-8 items-center rounded-control px-3 font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-ring">
                Ghost
              </button>
              <button type="button" className="inline-flex h-8 items-center rounded-control px-3 font-medium text-danger transition-colors hover:bg-danger-subtle focus-ring">
                Delete
              </button>
              <button type="button" disabled className="inline-flex h-8 items-center rounded-control bg-accent px-3 font-medium text-on-accent disabled:opacity-50">
                Disabled
              </button>
            </div>
            <div className="grid max-w-md gap-1.5">
              <label htmlFor="style-guide-input" className="text-caption font-medium text-fg-muted">Email</label>
              <input
                id="style-guide-input"
                type="email"
                placeholder="you@example.com"
                className="h-8 w-full rounded-control border border-line-strong bg-surface px-2.5 text-fg transition-colors placeholder:text-fg-subtle focus-ring"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent-strong">Page 7</span>
              <span className="rounded-full bg-success-subtle px-2 py-0.5 text-micro font-medium text-success">Indexed</span>
              <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-micro font-medium text-warning">Processing</span>
              <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-micro font-medium text-danger">Failed</span>
              <kbd className="rounded-control border border-line bg-surface-muted px-1.5 font-mono text-micro text-fg-muted">Ctrl K</kbd>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Section({ id, title, description, children }: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-10">
      <h2 id={id} className="text-title-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-fg-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Ratio({ value, min, block = false }: { value: number | null; min: number; block?: boolean }) {
  if (value == null) return <span className="ml-2 font-mono text-caption text-fg-subtle">—</span>
  const pass = value >= min
  return (
    <span className={cn("font-mono text-caption", block ? "mt-1 block" : "ml-2")}>
      <span className="text-fg-muted">{value.toFixed(2)}</span>{" "}
      <span className={pass ? "text-success" : "text-danger"}>{pass ? "Pass" : "Fail"}</span>
    </span>
  )
}

function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div role="group" aria-label="Theme" className="inline-flex gap-0.5 rounded-control border border-line bg-surface p-0.5">
        {THEMES.map(({ value, label, icon: Icon }) => {
          const selected = mounted && theme === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-caption font-medium transition-colors focus-ring",
                selected ? "bg-surface-muted text-fg" : "text-fg-muted hover:text-fg"
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
      <p className="text-caption text-fg-subtle">Resolved: {mounted ? resolvedTheme : "—"}</p>
    </div>
  )
}

function MotionDemo() {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-control border border-line bg-surface px-3 py-1.5 font-medium transition-colors duration-(--duration-fast) hover:bg-surface-muted focus-ring">
          Fast · 120ms
        </button>
        <button type="button" className="rounded-control border border-line bg-surface px-3 py-1.5 font-medium transition-colors duration-(--duration-base) hover:bg-surface-muted focus-ring">
          Base · 150ms
        </button>
        <button type="button" className="rounded-control border border-line bg-surface px-3 py-1.5 font-medium transition-colors duration-(--duration-slow) hover:bg-surface-muted focus-ring">
          Slow · 180ms
        </button>
      </div>
      <div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 font-medium transition-colors hover:bg-surface-muted focus-ring"
        >
          Toggle overlay (framer-motion · transition.base)
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={transition.base}
              className="mt-2 max-w-sm rounded-card bg-surface-raised p-3 shadow-overlay"
            >
              <p className="font-medium">Overlay</p>
              <p className="mt-1 text-caption text-fg-muted">Enters with a 4px offset and fade — no scale, no spring.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
