import { QueryClient } from "@tanstack/react-query"

/**
 * The app's single QueryClient.
 *
 * It lives in a module rather than in `useState` inside Providers because
 * non-React code needs it: stores/session.ts clears the cache when the signed-in
 * user changes, and it must be able to do that before any component re-renders
 * with the previous account's conversations still in memory.
 *
 * A fresh client is handed out during server rendering. A module-level singleton
 * on the server would be shared by every request, so one visitor's cached
 * conversations could be served into another's HTML.
 */
function build() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  })
}

let browserClient: QueryClient | null = null

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return build()
  browserClient ??= build()
  return browserClient
}
