"use client"

import { useAuthStore } from "@/stores/auth.store"
import { Avatar } from "@/components/ui/Avatar"

export default function ProfilePage() {
  const user = useAuthStore(s => s.user)
  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-4 py-6 text-body text-fg sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-title-lg font-semibold">Profile</h1>
          <p className="mt-1 text-fg-muted">Your DocuQuery account information.</p>
        </header>

        <section aria-labelledby="profile-name" className="rounded-card border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Avatar name={user?.name} src={user?.avatar} size="lg" />
            <div className="min-w-0">
              <h2 id="profile-name" className="truncate text-title-sm font-semibold">{user?.name}</h2>
              <p className="truncate text-fg-muted">{user?.email}</p>
            </div>
          </div>
          <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="Name" value={user?.name} />
            <Field label="Email" value={user?.email} />
            <Field label="Account created" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : undefined} />
          </dl>
        </section>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 wrap-anywhere">{value ?? "—"}</dd>
    </div>
  )
}
