import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatMode } from "@/types"

interface SettingsState {
  defaultMode: ChatMode
  showCitations: boolean
  set: <K extends keyof Omit<SettingsState, "set">>(key: K, value: SettingsState[K]) => void
}

export const useSettingsStore = create<SettingsState>()(persist((set) => ({
  defaultMode: "docuquery",
  showCitations: true,
  set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
}), { name: "docuquery-settings" }))

export const getDefaultChatMode = () => useSettingsStore.getState().defaultMode
