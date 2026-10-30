import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T } | { res: NextResponse }> {
  let json: unknown;
  try { json = await req.json(); } catch { return { res: fail(400, "Invalid JSON body") }; }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { res: fail(400, parsed.error.issues[0]?.message ?? "Invalid request") };
  return { data: parsed.data };
}
