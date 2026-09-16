"use client"
import { useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/Button"

/** Confirmation for an action that cannot be undone. Focus starts on Cancel, never on the destructive button. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Delete", busy = false, onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in" />
        <Dialog.Content
          onOpenAutoFocus={event => { event.preventDefault(); cancelRef.current?.focus() }}
          className="fixed inset-x-4 top-1/2 z-50 mx-auto w-auto max-w-sm -translate-y-1/2 rounded-card border border-line bg-surface-raised p-5 text-body text-fg shadow-modal outline-none data-[state=open]:animate-fade-in"
        >
          <Dialog.Title className="text-title-sm font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-fg-muted">{description}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button ref={cancelRef} variant="secondary" size="sm">Cancel</Button>
            </Dialog.Close>
            <Button variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
              {busy ? "Deleting…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
