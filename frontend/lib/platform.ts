import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** True on macOS and iOS, where shortcut hints show ⌘ instead of Ctrl. Always false while server rendering. */
export function useIsApplePlatform() {
  return useSyncExternalStore(
    subscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  )
}
