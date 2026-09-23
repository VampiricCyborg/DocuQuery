import { useEffect, useRef } from "react"

/**
 * Keeps the bottom of the transcript in view.
 *
 * Takes what it should react to rather than reading a store: the transcript is
 * server state now, and the two things that move the bottom of the list are a
 * message arriving and the current answer growing.
 */
export function useAutoScroll(messageCount: number, streamedText: string) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" })
  }, [messageCount, streamedText])

  return ref
}
