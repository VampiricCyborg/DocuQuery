"use client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "react-hot-toast"
import { useState } from "react"
import { useEffect } from "react"
import { useAuthStore } from "@/stores/auth.store"

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrateAuth = useAuthStore(s => s.hydrate)
  useEffect(() => { void hydrateAuth() }, [hydrateAuth])
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  }))

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: "#1a1a1a", color: "#f5f5f5", border: "1px solid #2a2a2a" },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
