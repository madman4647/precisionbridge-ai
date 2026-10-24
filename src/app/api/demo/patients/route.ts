import { handle, body } from "@/lib/api";
import { createDemoPatient, listDemoPatients } from "@/services/patients";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(req, (c) => listDemoPatients(c));
export const POST = async (req: Request) => { const b = await body(req); return handle(req, (c) => createDemoPatient(c, b)); };
