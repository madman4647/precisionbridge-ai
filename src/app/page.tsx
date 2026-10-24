import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE, verifySession } from "@/lib/session";
import { DEMO_USERS } from "@/lib/demoUsers";
import { Banner, Card } from "@/components/ui";

const HOME: Record<string, string> = { patient: "/patient", clinician: "/clinician", researcher: "/research", safety_admin: "/admin" };

export default async function Landing() {
  const user = await verifySession((await cookies()).get(COOKIE)?.value);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">PrecisionBridge AI</h1>
        <p className="mt-1 max-w-3xl text-muted">A clinician-supervised decision-support and research-hypothesis prototype. Two permission-separated wings share one safety-first core: nothing the system generates becomes a care plan until a clinician signs it.</p>
      </div>
      <Banner tone="warn" title="Prototype — synthetic data only">No real patients, no clinical validation, no 24/7 monitoring. Clinical content is illustrative and pending review by a qualified clinician.</Banner>
      <Card title="Choose a demo role">
        <p className="mb-3 text-sm text-muted">There is no real login. Use the <strong>Demo role</strong> switcher at the top of the page to pick a seeded demo user; permissions are enforced server-side for every request.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DEMO_USERS.map((u) => (
            <li key={u.id} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold">{u.display_name}</p>
              <p className="text-muted">{u.role.replace("_", " ")} — {u.description}</p>
              {user?.id === u.id && <Link className="mt-1 inline-block font-semibold text-brand-dark underline" href={HOME[u.role]}>Open workspace →</Link>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Storyboard (PRD §18)">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li><strong>Enrollment</strong> — Patient DM-042: history, kidney flag, unverified renal labs.</li>
          <li><strong>Routine check-in</strong> — ROUTINE; clinician option cards with a renal-status caution.</li>
          <li><strong>Human decision</strong> — signed follow-up request; patient sees only the approved action.</li>
          <li><strong>Safety stress test</strong> — DEP-017 self-harm fixture: escalation, ranking blocked, alert not falsely acknowledged.</li>
          <li><strong>Research insight</strong> — consent-gated cohort, suppression, speculative hypothesis, no route into care.</li>
          <li><strong>Trial + portability</strong> — dated mock trial pre-screen, module validation, KPIs and limitations.</li>
        </ol>
      </Card>
    </div>
  );
}
