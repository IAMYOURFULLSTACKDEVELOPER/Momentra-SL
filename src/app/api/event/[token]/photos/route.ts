import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventByToken } from "@/lib/guestEvent";
import { fail } from "@/lib/http";

export const runtime = "nodejs";
const PAGE = 40;

/** Cursor-paginated shared gallery. Only approved, ready photos of events whose gallery is shared with guests. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const event = await getEventByToken(token);
  if (!event) return fail(404, "Event not found");
  if (event.visibility !== "guests") return fail(403, "The organizers have not shared this gallery.");

  const cursor = new URL(req.url).searchParams.get("cursor");
  const db = createAdminClient();
  let q = db.from("photos").select("id,storage_path,thumb_path,video_path,width,height,created_at,media_type,mime_type")
    .eq("event_id", event.id).eq("state", "ready").eq("approval_status", "approved")
    .order("created_at", { ascending: false }).limit(PAGE + 1);
  if (cursor && !Number.isNaN(Date.parse(cursor))) q = q.lt("created_at", cursor);
  const { data, error } = await q;
  if (error) return fail(500, "Could not load photos");

  const rows = data.slice(0, PAGE);
  const paths = rows.flatMap((r) => [r.thumb_path, r.storage_path, r.video_path].filter((p): p is string => p !== null && p !== undefined));
  const signed = paths.length ? (await db.storage.from("photos").createSignedUrls(paths, 3600)).data ?? [] : [];
  const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const { count } = await db.from("photos").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("state", "ready").eq("approval_status", "approved");
  return NextResponse.json({
    total: count ?? 0,
    nextCursor: data.length > PAGE ? rows[rows.length - 1]!.created_at : null,
    photos: rows.map((r) => ({
      id: r.id,
      width: r.width,
      height: r.height,
      createdAt: r.created_at,
      thumbUrl: byPath.get(r.thumb_path) ?? null,
      fullUrl: byPath.get(r.storage_path) ?? null,
      videoUrl: r.video_path ? byPath.get(r.video_path) ?? null : null,
      mediaType: r.media_type || (r.mime_type?.startsWith("video/") ? "video" : "photo"),
    })),
  });
}
