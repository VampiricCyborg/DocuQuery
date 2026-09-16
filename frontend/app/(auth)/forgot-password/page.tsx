"use client"
import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { AuthField, AuthHeading, AuthLink } from "@/components/auth/AuthForm"
import { transition } from "@/lib/motion"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false)
    setSent(true)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={transition.slow}>
      {/* Persistent live region so screen readers announce the swap to the confirmation view */}
      <p role="status" className="sr-only">{sent ? "Reset link sent. Check your email." : ""}</p>
      {sent ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-success-subtle text-success">
            <CheckCircle className="size-5" aria-hidden="true" />
          </div>
          <AuthHeading title="Check your email" description="We've sent a password reset link to your inbox." />
          <AuthLink href="/login">Back to sign in</AuthLink>
        </div>
      ) : (
        <>
          <AuthHeading title="Reset your password" description="Enter your email and we'll send a reset link." />
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <AuthField id="forgot-email" label="Email">
              <Input id="forgot-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </AuthField>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          <div className="mt-6 flex justify-center">
            <Link href="/login" className="inline-flex items-center gap-1 rounded-control text-fg-muted transition-colors hover:text-fg focus-ring">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to sign in
            </Link>
          </div>
        </>
      )}
    </motion.div>
  )
}
