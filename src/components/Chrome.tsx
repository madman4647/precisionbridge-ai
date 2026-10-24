import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { WATERMARK } from "@/core/types";
import type { DemoUser } from "@/lib/demoUsers";
import { RoleSwitcher } from "./RoleSwitcher";

const NAV: Record<string, { href: string; label: string }[]> = {
  patient: [{ href: "/patient", label: "Home" }, { href: "/patient/consent", label: "Consent" }, { href: "/patient/profile", label: "Profile" }, { href: "/patient/checkin", label: "Check-in" }, { href: "/patient/plan", label: "My approved plan" }],
  clinician: [{ href: "/clinician", label: "Caseload" }],
  researcher: [{ href: "/research", label: "Workbench" }],
  safety_admin: [{ href: "/admin", label: "Modules" }, { href: "/admin/audit", label: "Audit log" }, { href: "/admin/consents", label: "Consent audit" }, { href: "/admin/metrics", label: "KPIs" }, { href: "/admin/emergency", label: "Emergency copy" }],
};

export function Chrome({ user, children }: { user: DemoUser | null; children: React.ReactNode }) {
  const marks = Array.from({ length: 14 }, (_, i) => i);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">Skip to content</a>
      <div className="watermark-bg" aria-hidden>
        {marks.map((i) => <span key={i} style={{ top: `${(i % 7) * 15 - 5}%`, left: `${Math.floor(i / 7) * 45 - 10}%` }}>{WATERMARK} · {WATERMARK}</span>)}
      </div>
      <div role="note" className="bg-red-800 px-4 py-1.5 text-center text-xs font-bold tracking-wide text-white">
        DEMO ONLY — {WATERMARK}. Illustrative content; no qualified clinician has reviewed it.
      </div>
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-dark"><ShieldCheck size={22} aria-hidden /> PrecisionBridge AI</Link>
          <RoleSwitcher current={user?.id ?? ""} />
        </div>
        {user && (
          <nav aria-label="Primary" className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 pb-2">
            {NAV[user.role].map((n) => <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-soft">{n.label}</Link>)}
          </nav>
        )}
      </header>
      <main id="main" className="relative z-10 mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs font-semibold text-red-800">{WATERMARK} · Prototype with synthetic data · Not a medical device · Not monitored 24/7</footer>
    </>
  );
}
