import toast from "react-hot-toast"

import { importLegacyChats } from "@/lib/legacyChats"
import { getQueryClient } from "@/lib/queryClient"
import { resetChatUIState } from "./chat.store"
import { useFileStore } from "./file.store"

/**
 * Ties account-specific client state to the signed-in user.
 *
 * Call it before publishing a new user — or null — to the auth store, so no page
 * ever renders with a previous account's data.
 *
 * Conversations are server state now, so there is nothing per-user left in
 * localStorage to swap: the whole job is clearing caches. `queryClient.clear()`
 * drops every cached conversation and message, which matters most on sign-out
 * and on switching accounts in one browser — without it the next account's first
 * paint would show the previous one's sidebar until the refetch landed.
 */
export async function setClientStateOwner(userId: string | null) {
  useFileStore.getState().reset()
  resetChatUIState()
  getQueryClient().clear()

  if (!userId) return

  // Chats saved by the pre-server version are uploaded once, then the local copy
  // is deleted. Failure is not fatal: the key survives and the next sign-in
  // retries, so this never blocks getting into the app.
  try {
    const imported = await importLegacyChats(userId)
    if (imported > 0) {
      toast.success(`Restored ${imported} saved ${imported === 1 ? "chat" : "chats"}.`)
      getQueryClient().invalidateQueries({ queryKey: ["conversations"] })
    }
  } catch {
    toast.error("Could not restore your older saved chats. We will try again next time.")
  }
}
