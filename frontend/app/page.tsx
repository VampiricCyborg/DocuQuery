"use client"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Check, ExternalLink, Shield, Sparkles, Zap } from "lucide-react"
import { useAuthStore } from "@/stores/auth.store"
import { Button } from "@/components/ui/Button"
import { Logo } from "@/components/brand/Logo"
import { ProductDemo } from "@/components/landing/ProductDemo"
import { HowItWorks } from "@/components/landing/HowItWorks"
import { FeatureShowcase } from "@/components/landing/FeatureShowcase"
import { transition } from "@/lib/motion"

// ─── Content ──────────────────────────────────────────────────────────────────

const TRUST_SIGNALS = [
  { icon: Shield, text: "Private & secure" },
  { icon: Zap, text: "Real-time streaming" },
  { icon: Check, text: "Grounded answers" },
]

const FOOTER_LINKS = [
  { href: "https://github.com/VampiricCyborg/DocuQuery", label: "GitHub", external: true },
]

/** Fade-and-rise once as a section scrolls into view. */
const reveal = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: transition.slow,
} as const

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
        <section aria-labelledby="hero-heading" className="relative px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-80" />

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition.slow}
            className="relative mx-auto flex max-w-3xl flex-col items-center text-center"
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
            className="relative mx-auto mt-14 max-w-5xl sm:mt-16"
          >
            <ProductDemo />
          </motion.div>
        </section>

        {/* ── How it works ── */}
        <section aria-labelledby="workflow-heading" className="border-t border-line bg-surface px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <motion.h2 {...reveal} id="workflow-heading" className="max-w-3xl text-title-lg font-semibold sm:text-display-sm">
              How it works. <span className="text-fg-muted">From upload to cited answer in seconds.</span>
            </motion.h2>
            <HowItWorks />
          </div>
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
            <FeatureShowcase />
          </div>
        </section>

        {/* ── Call to action ── */}
        <section aria-labelledby="cta-heading" className="border-t border-line bg-surface px-4 py-20 sm:px-6 sm:py-28">
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
