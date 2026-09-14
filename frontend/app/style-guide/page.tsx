import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StyleGuide } from "@/components/style-guide/StyleGuide"

export const metadata: Metadata = {
  title: "Style guide",
  robots: { index: false, follow: false },
}

/** Design-token reference. Development only — production builds serve a 404. */
export default function StyleGuidePage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <StyleGuide />
}
