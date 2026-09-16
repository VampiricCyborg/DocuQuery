"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth.store"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { AuthField, AuthHeading, AuthLink } from "@/components/auth/AuthForm"
import { transition } from "@/lib/motion"
import toast from "react-hot-toast"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      toast.success("Welcome back!")
      router.push("/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={transition.slow}>
      <AuthHeading title="Sign in" description="Welcome back. Enter your details to continue." />
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <AuthField id="login-email" label="Email">
          <Input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        </AuthField>
        <div className="space-y-2">
          <AuthField id="login-password" label="Password">
            <div className="relative">
              <Input
                id="login-password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pr-10"
              />
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw(v => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-control text-fg-subtle transition-colors hover:text-fg focus-ring"
              >
                {showPw ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </AuthField>
          <div className="flex justify-end">
            <AuthLink href="/forgot-password" className="text-caption text-fg-muted hover:text-fg">Forgot password?</AuthLink>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-fg-muted">
        No account? <AuthLink href="/signup">Sign up</AuthLink>
      </p>
    </motion.div>
  )
}
