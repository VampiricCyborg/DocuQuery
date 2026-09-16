"use client"
import { useRef } from "react"
import { motion, useInView, useReducedMotion } from "framer-motion"
import { Check, FileText, Search, Sparkles, Upload, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"
import { useDemoLoop, useTypewriter } from "./useDemoLoop"

/** Runs a scene's loop only while it is on screen, and never under reduced motion. */
function useSceneStep(steps: number, ref: React.RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion()
  const inView = useInView(ref, { margin: "-15% 0px" })
  return useDemoLoop(steps, { active: inView && !reduced, intervalMs: 1200, holdMs: 2200 })
}

const SCENE_FRAME = "flex h-40 flex-col justify-center gap-2 rounded-card border border-line bg-surface p-4"

function UploadScene() {
  const ref = useRef<HTMLDivElement>(null)
  const step = useSceneStep(3, ref)

  return (
    <div ref={ref} aria-hidden="true" className={cn(SCENE_FRAME, "items-center border-dashed")}>
      <motion.div
        animate={{ y: step === 0 ? -6 : 0, opacity: step === 0 ? 0 : 1 }}
        transition={transition.slow}
        className="w-full max-w-52 rounded-control border border-line bg-canvas p-2.5"
      >
        <div className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-fg-subtle" />
          <span className="min-w-0 flex-1 truncate text-caption font-medium">Q3_Report_2024.pdf</span>
          {step === 2 && <Check className="size-3.5 shrink-0 text-success" />}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted">
          <motion.div
            className="h-full rounded-full bg-accent"
            animate={{ width: step === 2 ? "100%" : step === 1 ? "45%" : "0%" }}
            transition={transition.slow}
          />
        </div>
      </motion.div>
      <p className="text-caption text-fg-subtle">
        {step === 0 ? "Drop files here" : step === 1 ? "Uploading…" : "Indexed"}
      </p>
    </div>
  )
}

function IndexScene() {
  const ref = useRef<HTMLDivElement>(null)
  const step = useSceneStep(3, ref)
  const dots = Array.from({ length: 24 })

  return (
    <div ref={ref} aria-hidden="true" className={SCENE_FRAME}>
      <div className="flex items-center gap-3">
        <div className="w-16 shrink-0 space-y-1 rounded-control border border-line bg-canvas p-2">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="h-1 rounded-full bg-line-strong"
              animate={{ opacity: step === 0 ? 0.35 : 1, width: step === 0 ? "60%" : "100%" }}
              transition={{ ...transition.slow, delay: i * 0.05 }}
            />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-8 gap-1.5">
          {dots.map((_, i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-accent"
              animate={{ opacity: step === 0 ? 0.12 : step === 1 && i > 11 ? 0.12 : 1 }}
              transition={{ duration: 0.25, delay: (i % 8) * 0.03 }}
            />
          ))}
        </div>
      </div>
      <p className="text-caption text-fg-subtle">
        {step === 0 ? "Splitting into passages" : step === 1 ? "Embedding passages" : "384-dim vectors stored"}
      </p>
    </div>
  )
}

const ASK_QUESTION = "Which risks are flagged for Q4?"

function AskScene() {
  const ref = useRef<HTMLDivElement>(null)
  const step = useSceneStep(2, ref)
  const reduced = useReducedMotion()
  const typed = useTypewriter(ASK_QUESTION, step === 0 && !reduced, 34)

  return (
    <div ref={ref} aria-hidden="true" className={SCENE_FRAME}>
      <div className="inline-flex w-fit items-center gap-1.5 rounded-control border border-line px-2 py-0.5 text-micro text-fg-muted">
        <Zap className="size-3" />
        DocuQuery mode
      </div>
      <div className="flex items-center gap-2 rounded-control border border-line-strong bg-canvas px-3 py-2">
        <span className="min-w-0 flex-1 truncate">
          {step === 0 ? typed : ASK_QUESTION}
          {step === 0 && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-fg-muted align-text-bottom" />}
        </span>
        <kbd className="shrink-0 rounded-control border border-line bg-surface-muted px-1.5 font-mono text-micro text-fg-subtle">
          Enter
        </kbd>
      </div>
      <p className="text-caption text-fg-subtle">Plain language — no query syntax</p>
    </div>
  )
}

function AnswerScene() {
  const ref = useRef<HTMLDivElement>(null)
  const step = useSceneStep(3, ref)

  return (
    <div ref={ref} aria-hidden="true" className={SCENE_FRAME}>
      <div className="space-y-1.5">
        {[0, 1].map(i => (
          <motion.div
            key={i}
            className="h-1.5 rounded-full bg-surface-muted"
            animate={{ width: step === 0 ? "35%" : i === 0 ? "100%" : "72%" }}
            transition={{ ...transition.slow, delay: i * 0.08 }}
          />
        ))}
      </div>
      <motion.div
        animate={{ opacity: step >= 2 ? 1 : 0.25, y: step >= 2 ? 0 : 4 }}
        transition={transition.slow}
        className="rounded-control border border-line bg-canvas px-2.5 py-2"
      >
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-fg-subtle" />
          <span className="min-w-0 flex-1 truncate text-caption font-medium">Q3_Report_2024.pdf</span>
          <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 py-0.5 text-micro font-medium text-accent-strong">
            Page 7
          </span>
        </div>
      </motion.div>
      <p className="text-caption text-fg-subtle">
        {step >= 2 ? "Every claim links back to its source" : "Writing the answer…"}
      </p>
    </div>
  )
}

const STEPS = [
  {
    icon: Upload,
    label: "Upload",
    desc: "Drop in PDF, DOCX, TXT or MD files — up to 50MB each.",
    scene: UploadScene,
  },
  {
    icon: Zap,
    label: "Index",
    desc: "Each file is split into passages, embedded and stored in pgvector.",
    scene: IndexScene,
  },
  {
    icon: Search,
    label: "Ask",
    desc: "Ask in plain language, in the mode that suits the question.",
    scene: AskScene,
  },
  {
    icon: Sparkles,
    label: "Answer",
    desc: "Answers stream back with the page and passage they came from.",
    scene: AnswerScene,
  },
]

export function HowItWorks() {
  return (
    <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map(({ icon: Icon, label, desc, scene: Scene }, i) => (
        <motion.li
          key={label}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ ...transition.slow, delay: i * 0.05 }}
          className="flex flex-col gap-4 rounded-card border border-line bg-canvas p-4"
        >
          <Scene />
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-medium">
                <Icon className="size-4 text-fg-muted" aria-hidden="true" />
                {label}
              </span>
              <span className="font-mono text-caption text-fg-subtle">0{i + 1}</span>
            </div>
            <p className="mt-1.5 text-fg-muted">{desc}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  )
}
