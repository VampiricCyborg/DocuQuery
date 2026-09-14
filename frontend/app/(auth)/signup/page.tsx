"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth.store"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { AuthField, AuthHeading, AuthLink } from "@/components/auth/AuthForm"
import { transition } from "@/lib/motion"
import toast from "react-hot-toast"

export default function SignupPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const { signup } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signup(name, email, password)
      toast.success("Account created!")
      router.push("/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account")
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={transition.slow}>
      <AuthHeading title="Create your account" description="Upload documents and get answers with citations." />
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {[
          { label: "Name", value: name, set: setName, type: "text", placeholder: "Your name", autoComplete: "name" },
          { label: "Email", value: email, set: setEmail, type: "email", placeholder: "you@example.com", autoComplete: "email" },
          { label: "Password", value: password, set: setPassword, type: "password", placeholder: "Min 8 characters", autoComplete: "new-password" },
        ].map(({ label, value, set, type, placeholder, autoComplete }) => {
          const id = `signup-${label.toLowerCase()}`
          return (
            <AuthField key={label} id={id} label={label}>
              <Input id={id} type={type} autoComplete={autoComplete} value={value} onChange={e => set(e.target.value)} placeholder={placeholder} required />
            </AuthField>
          )
        })}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-fg-muted">
        Already have an account? <AuthLink href="/login">Sign in</AuthLink>
      </p>
    </motion.div>
  )
}
