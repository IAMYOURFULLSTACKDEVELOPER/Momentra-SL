import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventByToken } from "@/lib/guestEvent";
import { fail, parseBody } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const body = await parseBody(req, z.object({ reason: z.string().trim().min(1).max(500) }));
  if ("res" in body) return body.res;
  const event = await getEventByToken(token);
  if (!event || event.visibility !== "guests" || !z.string().uuid().safeParse(id).success) return fail(404, "Not found");
  const db = createAdminClient();
  const { data: photo } = await db.from("photos").select("id").eq("id", id).eq("event_id", event.id).eq("approval_status", "approved").maybeSingle();
  if (!photo) return fail(404, "Not found");
  await db.from("content_reports").insert({ photo_id: id, event_id: event.id, reason: body.data.reason });
  return NextResponse.json({ ok: true });
}
