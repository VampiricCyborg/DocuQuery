import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"

// The opsz axis switches Inter to its display cut automatically at headline sizes.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter", display: "swap" })

export const metadata: Metadata = {
  title: { default: "DocuQuery — Understand your documents with AI", template: "%s | DocuQuery" },
  description: "Upload your documents, ask questions naturally, and get grounded answers with citations powered by Retrieval Augmented Generation.",
  metadataBase: new URL("https://docuquery.ai"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "DocuQuery — Understand your documents with AI",
    description: "Grounded answers from your documents, with citations you can trust.",
    type: "website",
    url: "/",
    siteName: "DocuQuery",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "DocuQuery AI document workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DocuQuery — Understand your documents with AI",
    description: "Grounded answers from your documents, with citations you can trust.",
    images: ["/og-image.svg"],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
