import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-[1.05rem] tracking-tight">
            <LogoMark />
            Fairhold
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 text-sm">
            <Link href="/ops" className="px-3 py-2 rounded-md text-ink-2 hover:text-ink hover:bg-surface-2">
              Operations
            </Link>
            <Link href="/new" className="btn btn-primary btn-sm">
              New agreement
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 text-sm text-ink-3 flex flex-col sm:flex-row gap-2 justify-between">
          <p>Fairhold runs on the PayPal sandbox. No real money moves.</p>
          <p>Built for the PayPal AI Hackathon, 2026.</p>
        </div>
      </footer>
    </>
  );
}
