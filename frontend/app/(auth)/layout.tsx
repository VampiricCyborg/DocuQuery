import Link from "next/link"
import { Logo } from "@/components/brand/Logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-4 text-body text-fg">
      <header className="flex justify-center pt-10 pb-8 sm:pt-16">
        <Link href="/" aria-label="DocuQuery home" className="rounded-control focus-ring">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 justify-center pb-16">
        <div className="h-fit w-full max-w-sm rounded-card border border-line bg-surface p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
