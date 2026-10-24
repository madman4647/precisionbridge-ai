import { pageCtx, allow } from "@/lib/page";
import { listModules, getFaultInjection } from "@/services/admin";
import { Denied } from "@/components/ui";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { SAMPLE_MODULES } from "@/core/modules/registry";

export default async function AdminHome() {
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["safety_admin"], "/admin"))) return <Denied what="The admin console is for the safety/admin reviewer." />;
  const mods = await listModules(ctx);
  if (!mods.ok) return <Denied />;
  const fault = await getFaultInjection(ctx);
  return <AdminConsole modules={mods.data} fault={fault.safety_timeout} samples={{ "Valid 4th module (asthma demo)": SAMPLE_MODULES.asthma_demo, "Invalid: no signed reviewer + malformed rule": SAMPLE_MODULES.invalid_demo, "Invalid: expired evidence": SAMPLE_MODULES.expired_demo }} />;
}
