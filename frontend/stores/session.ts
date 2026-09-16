import { bindChatStoreToUser } from "./chat.store"
import { useFileStore } from "./file.store"

/**
 * Ties account-specific client state (saved chats, the document list) to the signed-in user.
 * Call it before publishing a new user — or null — to the auth store, so no page ever renders
 * with a previous account's data.
 */
export async function setClientStateOwner(userId: string | null, options?: { adoptLegacyChats?: boolean }) {
  useFileStore.getState().reset()
  await bindChatStoreToUser(userId, options)
}
