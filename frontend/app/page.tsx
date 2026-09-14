"use client"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight, ArrowUp, BookOpen, Check, ExternalLink, FileText, Files,
  LayoutDashboard, MessageSquare, Search, Shield, Sparkles, Upload, Zap,
} from "lucide-react"
import { useAuthStore } from "@/stores/auth.store"
import { Button } from "@/components/ui/Button"
import { Logo } from "@/components/brand/Logo"
import { transition } from "@/lib/motion"
import { cn } from "@/lib/utils"

// ─── Content ──────────────────────────────────────────────────────────────────

const TRUST_SIGNALS = [
  { icon: Shield, text: "Private & secure" },
  { icon: Zap, text: "Real-time streaming" },
  { icon: Check, text: "Grounded answers" },
]

const FEATURES = [
  {
    icon: MessageSquare,
    title: "AI Document Chat",
    description: "Ask questions about your uploaded documents. Receive grounded answers with citations linking back to the exact source page and chunk.",
  },
  {
    icon: BookOpen,
    title: "Persistent Conversations",
    description: "Every conversation is automatically saved with full history. Continue exactly where you left off — across sessions, across devices.",
  },
  {
    icon: Zap,
    title: "Hybrid AI",
    description: "Combine vector retrieval from your documents with powerful LLM reasoning. Get the best of both worlds in every response.",
  },
]

const WORKFLOW = [
  { icon: Upload, label: "Upload", desc: "PDF, DOCX, TXT, MD" },
  { icon: Zap, label: "Index", desc: "Auto-embed & store" },
  { icon: Search, label: "Ask", desc: "Natural language query" },
  { icon: Sparkles, label: "Answer", desc: "Grounded + cited" },
]

const FOOTER_LINKS = [
  { href: "https://github.com", label: "GitHub", external: true },
  { href: "#", label: "Documentation" },
  { href: "#", label: "Privacy" },
  { href: "#", label: "About" },
]

/** Fade-and-rise once as a section scrolls into view. */
const reveal = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: transition.slow,
} as const

// ─── Product preview (static illustration of the chat UI) ─────────────────────

const PREVIEW_NAV = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: MessageSquare, label: "Chat", active: true },
  { icon: Files, label: "Files" },
]

const PREVIEW_DOCUMENTS = ["Q3_Report_2024.pdf", "Board_Minutes.docx", "Pricing_Notes.txt"]

const PREVIEW_FINDINGS = [
  "Revenue grew 23% YoY to $4.2M",
  "Customer acquisition cost decreased by 18%",
  "Net Promoter Score improved to 72",
]

function ProductPreview() {
  return (
    <figure className="overflow-hidden rounded-card border border-line bg-surface">
      <figcaption className="sr-only">
        Preview of DocuQuery: a question about a Q3 report answered from an uploaded document, with the cited source listed.
      </figcaption>

      {/* Browser chrome */}
      <div aria-hidden="true" className="flex items-center gap-3 border-b border-line bg-surface-muted px-3 py-2">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <div className="mx-auto w-full max-w-xs truncate rounded-control border border-line bg-surface px-3 py-0.5 text-center text-micro text-fg-subtle">
          docuquery.ai/chat
        </div>
        <div className="w-10" />
      </div>

      <div aria-hidden="true" className="flex text-left">
        {/* Sidebar */}
        <div className="hidden w-52 shrink-0 flex-col gap-5 border-r border-line bg-canvas p-3 md:flex">
          <div className="space-y-0.5">
            {PREVIEW_NAV.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-2 rounded-control px-2 py-1.5 text-caption",
                  active ? "bg-surface-muted font-medium text-fg" : "text-fg-muted"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </div>
            ))}
          </div>
          <div>
            <p className="px-2 pb-1 text-micro font-medium text-fg-subtle">Documents</p>
            {PREVIEW_DOCUMENTS.map(name => (
              <div key={name} className="flex items-center gap-2 px-2 py-1 text-caption text-fg-muted">
                <FileText className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="truncate">{name}</span>
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-success" />
              </div>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <p className="truncate font-medium">Q3 report findings</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-control border border-line px-2 py-0.5 text-micro text-fg-muted">
              <Zap className="size-3" />
              DocuQuery mode
            </span>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            <div className="flex justify-end">
              <p className="max-w-sm rounded-card bg-surface-muted px-3 py-2">What are the key findings in the Q3 report?</p>
            </div>

            <div className="max-w-xl space-y-3">
              <p className="text-body-lg">Based on the Q3 report, the key findings include:</p>
              <ul className="space-y-1.5 text-body-lg">
                {PREVIEW_FINDINGS.map(finding => (
                  <li key={finding} className="flex gap-2.5">
                    <span className="mt-2.5 size-1 shrink-0 rounded-full bg-fg-subtle" />
                    {finding}
                  </li>
                ))}
              </ul>
              <div className="rounded-card border border-line bg-canvas">
                <p className="border-b border-line px-3 py-1.5 text-micro font-medium uppercase tracking-wide text-fg-subtle">Sources</p>
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption font-medium">Q3_Report_2024.pdf</p>
                    <p className="text-micro text-fg-subtle">Page 7 · Chunks 12, 14</p>
                  </div>
                  <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent-strong">Cited</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-line p-3">
            <div className="flex items-center gap-2 rounded-control border border-line-strong bg-surface py-1.5 pr-1.5 pl-3 text-fg-subtle">
              Ask about your documents…
              <span className="ml-auto flex size-6 items-center justify-center rounded-control bg-accent text-on-accent">
                <ArrowUp className="size-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user, isHydrated } = useAuthStore()
  const authenticated = isHydrated && !!user
  const primaryHref = authenticated ? "/chat" : "/signup"

  return (
    <div className="min-h-dvh bg-canvas text-body text-fg">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur">
        <nav aria-label="Primary" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="DocuQuery home" className="rounded-control focus-ring">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {!authenticated && (
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
            <Button asChild>
              <Link href={primaryHref}>{authenticated ? "Continue chat" : "Get started"}</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section aria-labelledby="hero-heading" className="px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition.slow}
            className="mx-auto flex max-w-3xl flex-col items-center text-center"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-caption font-medium text-fg-muted">
              <Sparkles className="size-3.5 text-fg-subtle" aria-hidden="true" />
              RAG-powered document intelligence
            </p>

            <h1 id="hero-heading" className="mt-6 text-display-sm font-semibold sm:text-display">
              Understand your documents with AI.
            </h1>

            <p className="mt-5 max-w-xl text-title-sm font-normal text-fg-muted">
              Upload PDFs, DOCX, TXT and more. Ask questions naturally. Receive grounded answers
              with citations — powered by Retrieval Augmented Generation.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href={primaryHref}>
                  {authenticated ? "Open DocuQuery" : "Get started free"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              {!authenticated && (
                <Button asChild size="lg" variant="secondary">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </div>

            <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-caption text-fg-muted">
              {TRUST_SIGNALS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5">
                  <Icon className="size-3.5 text-fg-subtle" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transition.slow, delay: 0.06 }}
            className="mx-auto mt-14 max-w-5xl sm:mt-16"
          >
            <ProductPreview />
          </motion.div>
        </section>

        {/* ── Features ── */}
        <section aria-labelledby="features-heading" className="border-t border-line px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <motion.h2 {...reveal} id="features-heading" className="max-w-3xl text-title-lg font-semibold sm:text-display-sm">
              Everything you need for document intelligence.{" "}
              <span className="text-fg-muted">
                Built for teams and individuals who need to query, analyze, and interact with private document fleets.
              </span>
            </motion.h2>

            <div className="mt-12 grid border-t border-line sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <motion.div
                  key={title}
                  {...reveal}
                  className="border-b border-line py-8 last:border-b-0 sm:border-b-0 sm:border-l sm:px-8 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
                >
                  <Icon className="size-5 text-fg-muted" aria-hidden="true" />
                  <h3 className="mt-4 text-title-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-body-lg text-fg-muted">{description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section aria-labelledby="workflow-heading" className="border-t border-line bg-surface px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <motion.h2 {...reveal} id="workflow-heading" className="max-w-3xl text-title-lg font-semibold sm:text-display-sm">
              How it works. <span className="text-fg-muted">From upload to answer in seconds.</span>
            </motion.h2>

            <motion.ol {...reveal} className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW.map(({ icon: Icon, label, desc }, i) => (
                <li key={label} className="bg-canvas p-6">
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-fg-muted" aria-hidden="true" />
                    <span className="font-mono text-caption text-fg-subtle">0{i + 1}</span>
                  </div>
                  <p className="mt-8 text-title-sm font-semibold">{label}</p>
                  <p className="mt-1 text-fg-muted">{desc}</p>
                </li>
              ))}
            </motion.ol>
          </div>
        </section>

        {/* ── Call to action ── */}
        <section aria-labelledby="cta-heading" className="border-t border-line px-4 py-20 sm:px-6 sm:py-28">
          <motion.div {...reveal} className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h2 id="cta-heading" className="text-title-lg font-semibold sm:text-display-sm">
              Ready to query your documents with AI?
            </h2>
            <p className="mt-4 text-title-sm font-normal text-fg-muted">
              Upload your first document and get grounded, cited answers in seconds.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href={primaryHref}>
                {authenticated ? "Open DocuQuery" : "Get started free"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-line px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Logo />
            <span className="text-caption text-fg-subtle">Enterprise RAG Platform</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(({ href, label, external }) => (
              <Link
                key={label}
                href={href}
                className="inline-flex items-center gap-1 rounded-control text-caption text-fg-muted transition-colors hover:text-fg focus-ring"
              >
                {label}
                {external && <ExternalLink className="size-3" aria-hidden="true" />}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl border-t border-line pt-6 text-caption text-fg-subtle">
          © {new Date().getFullYear()} DocuQuery. Built with Next.js, FastAPI, pgvector, and Groq.
        </p>
      </footer>
    </div>
  )
}
