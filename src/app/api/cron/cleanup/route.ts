import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail } from "@/lib/http";

/** Removes abandoned uploads (>2h in 'uploading') and failed rows, including their storage objects. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "Unauthorized");
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { data: stale } = await db.from("photos").select("id,storage_path,thumb_path").or(`and(state.eq.uploading,created_at.lt.${cutoff}),and(state.eq.failed,updated_at.lt.${cutoff})`).limit(500);
  if (!stale?.length) return NextResponse.json({ removed: 0 });
  await db.storage.from("photos").remove(stale.flatMap((r) => [r.storage_path, r.thumb_path]));
  await db.from("photos").delete().in("id", stale.map((r) => r.id));
  return NextResponse.json({ removed: stale.length });
}
