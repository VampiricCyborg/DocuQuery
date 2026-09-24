import { create } from "zustand"
import type { User } from "@/types"
import { setClientStateOwner } from "./session"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isHydrated: boolean
  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    let detail = "Authentication request failed"
    try {
      const body = await response.json() as { detail?: string }
      detail = body.detail ?? detail
    } catch { /* preserve generic error */ }
    throw new Error(detail)
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  hydrate: async () => {
    let user: User | null = null
    try {
      user = await authRequest<User>("/auth/me")
    } catch { /* no valid session */ }
    await setClientStateOwner(user?.id ?? null)
    set({ user, isAuthenticated: !!user, isHydrated: true })
  },
  login: async (email, password) => {
    const user = await authRequest<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    await setClientStateOwner(user.id)
    set({ user, isAuthenticated: true, isHydrated: true })
  },
  signup: async (name, email, password) => {
    const user = await authRequest<User>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    })
    await setClientStateOwner(user.id)
    set({ user, isAuthenticated: true, isHydrated: true })
  },
  logout: async () => {
    try { await authRequest<void>("/auth/logout", { method: "POST" }) } finally {
      await setClientStateOwner(null)
      set({ user: null, isAuthenticated: false, isHydrated: true })
    }
  },
}))
