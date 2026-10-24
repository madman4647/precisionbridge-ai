import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, Siren, ShieldAlert, Ban, Eye, XCircle } from "lucide-react";
import { clsx } from "clsx";

export function cx(...a: Parameters<typeof clsx>) { return clsx(...a); }

export function Card({ title, children, className, actions, id }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("rounded-xl border border-line bg-surface p-4 shadow-sm", className)}>
      {(title || actions) && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">{title && <h2 className="text-base font-semibold">{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}

const STATE = {
  URGENT: { icon: Siren, cls: "bg-red-100 text-red-900 border-red-300", label: "URGENT" },
  PROMPT_REVIEW: { icon: AlertTriangle, cls: "bg-amber-100 text-amber-900 border-amber-300", label: "PROMPT REVIEW" },
  ROUTINE: { icon: CheckCircle2, cls: "bg-green-100 text-green-900 border-green-300", label: "ROUTINE" },
  UNABLE_TO_ASSESS: { icon: CircleHelp, cls: "bg-violet-100 text-violet-900 border-violet-300", label: "UNABLE TO ASSESS" },
} as const;

/** Status is never colour-only: icon + text label. */
export function StateBadge({ state }: { state: keyof typeof STATE | string | null }) {
  if (!state || !(state in STATE)) return <span className="inline-flex items-center gap-1 rounded-full border border-line bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">No evaluation</span>;
  const s = STATE[state as keyof typeof STATE];
  const I = s.icon;
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold", s.cls)}><I size={14} aria-hidden /> {s.label}</span>;
}

const OPT = {
  eligible_for_review: { icon: CheckCircle2, cls: "bg-green-100 text-green-900 border-green-300", label: "Eligible for review" },
  requires_manual_review: { icon: Eye, cls: "bg-amber-100 text-amber-900 border-amber-300", label: "Requires manual review" },
  excluded_by_rule: { icon: Ban, cls: "bg-red-100 text-red-900 border-red-300", label: "Excluded by rule" },
} as const;
export function OptionStatusBadge({ status }: { status: keyof typeof OPT }) {
  const s = OPT[status]; const I = s.icon;
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold", s.cls)}><I size={14} aria-hidden /> {s.label}</span>;
}

export function Badge({ children, tone = "slate", icon }: { children: ReactNode; tone?: "slate" | "teal" | "amber" | "red" | "green"; icon?: ReactNode }) {
  const t = { slate: "bg-slate-100 text-slate-800 border-slate-300", teal: "bg-brand-soft text-brand-dark border-teal-300", amber: "bg-amber-100 text-amber-900 border-amber-300", red: "bg-red-100 text-red-900 border-red-300", green: "bg-green-100 text-green-900 border-green-300" }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", t)}>{icon}{children}</span>;
}

export function IllustrativeBadge() {
  return <Badge tone="amber" icon={<Info size={12} aria-hidden />}>Illustrative content — pending clinical review</Badge>;
}

export function Banner({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const t = { info: "border-sky-300 bg-sky-50 text-sky-950", warn: "border-amber-300 bg-amber-50 text-amber-950", danger: "border-red-400 bg-red-50 text-red-950", ok: "border-green-300 bg-green-50 text-green-950" }[tone];
  const I = { info: Info, warn: AlertTriangle, danger: ShieldAlert, ok: CheckCircle2 }[tone];
  return <div role={tone === "danger" ? "alert" : "note"} className={cx("flex gap-3 rounded-lg border p-3 text-sm", t)}><I className="mt-0.5 shrink-0" size={18} aria-hidden /><div>{title && <p className="font-semibold">{title}</p>}{children}</div></div>;
}

export function Denied({ what }: { what?: string }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Banner tone="danger" title="403 — Access denied"><p>{what ?? "You do not have permission to view this page."} The attempt has been logged. Use the role switcher above to choose a role with access.</p></Banner>
    </div>
  );
}

export function Button({ children, variant = "primary", className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const v = { primary: "bg-brand text-white hover:bg-brand-dark", secondary: "border border-line bg-white text-ink hover:bg-slate-50", danger: "bg-red-700 text-white hover:bg-red-800", ghost: "text-brand-dark hover:bg-brand-soft" }[variant];
  return <button {...rest} className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50", v, className)}>{children}</button>;
}

export const inputCls = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export function Field({ label, htmlFor, hint, children }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="space-y-1"><label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>{children}{hint && <p className="text-xs text-muted">{hint}</p>}</div>;
}

export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        {caption && <caption className="mb-2 text-left text-xs text-muted">{caption}</caption>}
        <thead><tr className="border-b border-line bg-slate-50">{head.map((h, i) => <th key={i} scope="col" className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Cross() { return <XCircle size={14} aria-hidden />; }
