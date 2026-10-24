import { handle, type Params } from "@/lib/api";
import { paraphraseQuestions } from "@/services/llm";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => paraphraseQuestions(c, id)); };
