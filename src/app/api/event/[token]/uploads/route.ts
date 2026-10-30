import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventByToken, uploadsOpen } from "@/lib/guestEvent";
import { fail, parseBody } from "@/lib/http";
import { uploadInitSchema } from "@/lib/validation";
import { extFor } from "@/lib/imageSniff";

export const runtime = "nodejs";

/** Step 1 of a guest upload: verify everything server-side, then hand out single-path signed upload URLs. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await parseBody(req, uploadInitSchema);
  if ("res" in body) return body.res;
  const { guestId, files } = body.data;

  const event = await getEventByToken(token);
  if (!event) return fail(404, "Event not found");
  const gate = uploadsOpen(event);
  if (!gate.open) return fail(403, gate.reason!);
  if (files.some((f) => f.size > event.max_file_bytes)) return fail(413, `Each photo must be under ${Math.floor(event.max_file_bytes / 1048576)} MB.`);

  const db = createAdminClient();
  const { data: session, error: sErr } = await db.from("upload_sessions")
    .upsert({ event_id: event.id, guest_identifier: guestId, expires_at: new Date(Date.now() + 24 * 3600e3).toISOString() }, { onConflict: "event_id,guest_identifier" })
    .select("id,status").single();
  if (sErr || !session) return fail(500, "Could not start upload session");
  if (session.status === "blocked") return fail(403, "Uploads from this device have been disabled.");

  const { count } = await db.from("photos").select("id", { count: "exact", head: true }).eq("upload_session_id", session.id).in("state", ["uploading", "ready"]);
  if ((count ?? 0) + files.length > event.max_photos_per_guest) return fail(429, "You have reached the photo limit for this event.");

  const { data: usage } = await db.rpc("event_usage_bytes", { eid: event.id });
  const incoming = files.reduce((n, f) => n + f.size, 0);
  if (Number(usage ?? 0) + incoming > event.storage_quota_bytes) return fail(413, "This event's storage is full.");

  const out: { photoId: string; original: { path: string; token: string }; thumb: { path: string; token: string } }[] = [];
  for (const f of files) {
    const photoId = randomUUID();
    // Server-generated names only: original filenames are never used in paths.
    const path = `events/${event.id}/${photoId}/original.${extFor(f.mime)}`;
    const thumbPath = `events/${event.id}/${photoId}/thumb.jpg`;
    const { error } = await db.from("photos").insert({
      id: photoId, event_id: event.id, upload_session_id: session.id, storage_path: path, thumb_path: thumbPath,
      original_filename: f.name.replace(/[\u0000-\u001f]/g, "").slice(0, 255), mime_type: f.mime, file_size_bytes: f.size, state: "uploading",
    });
    if (error) return fail(500, "Could not register upload");
    const [o, t] = await Promise.all([db.storage.from("photos").createSignedUploadUrl(path), db.storage.from("photos").createSignedUploadUrl(thumbPath)]);
    if (o.error || t.error || !o.data || !t.data) return fail(500, "Could not authorize upload");
    out.push({ photoId, original: { path, token: o.data.token }, thumb: { path: thumbPath, token: t.data.token } });
  }
  return NextResponse.json({ uploads: out });
}
