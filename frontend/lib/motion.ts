/**
 * Motion tokens for framer-motion, which cannot read CSS variables.
 * Keep these in sync with --duration-* and --ease-standard in app/globals.css.
 */

export const duration = { fast: 0.12, base: 0.15, slow: 0.18 } as const

export const ease = { standard: [0.2, 0, 0, 1] } as const

export const transition = {
  fast: { duration: duration.fast, ease: ease.standard },
  base: { duration: duration.base, ease: ease.standard },
  slow: { duration: duration.slow, ease: ease.standard },
} as const
