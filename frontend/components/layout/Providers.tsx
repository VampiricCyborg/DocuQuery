"use client"
import { QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"
import { ThemeProvider } from "next-themes"
import { Toaster } from "react-hot-toast"
import { useEffect } from "react"
import { useAuthStore } from "@/stores/auth.store"
import { getQueryClient } from "@/lib/queryClient"

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrateAuth = useAuthStore(s => s.hydrate)
  useEffect(() => { void hydrateAuth() }, [hydrateAuth])
  // Shared with stores/session.ts, which clears it when the signed-in user changes.
  const queryClient = getQueryClient()

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--color-surface-raised)",
                color: "var(--color-fg)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--shadow-overlay)",
                fontSize: "var(--text-body)",
                lineHeight: "var(--text-body--line-height)",
              },
              success: { iconTheme: { primary: "var(--color-success)", secondary: "var(--color-surface-raised)" } },
              error: { iconTheme: { primary: "var(--color-danger)", secondary: "var(--color-surface-raised)" } },
            }}
          />
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
