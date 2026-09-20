"use client"
import { useEffect, useState } from "react"

/**
 * Cycles through 0…steps-1 while `active`, holding longer on the final step.
 * When inactive (reduced motion, or off screen) it parks on the final step, so the
 * illustration still shows its finished state instead of an empty frame.
 */
export function useDemoLoop(steps: number, { intervalMs = 1500, holdMs = 3200, active = true } = {}) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!active) return
    const delay = step === steps - 1 ? holdMs : intervalMs
    const id = setTimeout(() => setStep(current => (current + 1) % steps), delay)
    return () => clearTimeout(id)
  }, [step, steps, intervalMs, holdMs, active])

  return active ? step : steps - 1
}

/** Reveals `text` one character at a time while `active`; shows it in full otherwise. */
export function useTypewriter(text: string, active: boolean, speedMs = 26) {
  const [count, setCount] = useState(active ? 0 : text.length)
  // Rewinding belongs in render, not in an effect: an effect would let the browser
  // paint the previous line's length for a frame before snapping back to zero.
  const [inputs, setInputs] = useState({ text, active })
  if (inputs.text !== text || inputs.active !== active) {
    setInputs({ text, active })
    setCount(active ? 0 : text.length)
  }

  useEffect(() => {
    if (!active) return
    let typed = 0
    const id = setInterval(() => {
      typed += 1
      setCount(typed)
      if (typed >= text.length) clearInterval(id)
    }, speedMs)
    return () => clearInterval(id)
  }, [text, active, speedMs])

  return text.slice(0, count)
}
