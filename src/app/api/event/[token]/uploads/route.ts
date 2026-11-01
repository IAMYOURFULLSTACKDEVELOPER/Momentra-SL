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

  const out: { photoId: string; original: { path: string; token: string }; thumb: { path: string; token: string }; video?: { path: string; token: string } }[] = [];
  for (const f of files) {
    const photoId = randomUUID();
    const mediaType = f.mediaType || (f.mime.startsWith("video/") ? "video" : "photo");
    // Server-generated names only: original filenames are never used in paths.
    const path = `events/${event.id}/${photoId}/original.${extFor(f.mime)}`;
    const thumbPath = `events/${event.id}/${photoId}/thumb.jpg`;
    const videoPath = mediaType === "video" ? `events/${event.id}/${photoId}/video.${extFor(f.mime)}` : null;

    // Build insert data conditionally based on whether video columns might exist
    const insertData: Record<string, unknown> = {
      id: photoId,
      event_id: event.id,
      upload_session_id: session.id,
      storage_path: path,
      thumb_path: thumbPath,
      original_filename: f.name.replace(/[\u0000-\u001f]/g, "").slice(0, 255),
      mime_type: f.mime,
      file_size_bytes: f.size,
      state: "uploading",
    };

    // Only include video-related fields if it's a video
    // If columns don't exist, this will fail and we'll fall back to legacy behavior
    if (mediaType === "video" && videoPath) {
      insertData.media_type = mediaType;
      insertData.video_path = videoPath;
      if (f.duration) insertData.duration_ms = f.duration;
    } else {
      insertData.media_type = "image";
    }

    const { error } = await db.from("photos").insert(insertData);
    if (error) {
      console.error("Photo registration failed:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      // If error is about missing column, try without video fields
      if (error.code === "42703" || error.message?.includes("column") || error.message?.includes("does not exist")) {
        console.warn("Video columns may not exist, retrying without media_type/video_path/duration_ms");
        const legacyInsertData = {
          id: photoId,
          event_id: event.id,
          upload_session_id: session.id,
          storage_path: path,
          thumb_path: thumbPath,
          original_filename: f.name.replace(/[\u0000-\u001f]/g, "").slice(0, 255),
          mime_type: f.mime,
          file_size_bytes: f.size,
          state: "uploading",
        };
        const { error: retryError } = await db.from("photos").insert(legacyInsertData);
        if (retryError) {
          console.error("Legacy photo registration also failed:", { code: retryError.code, message: retryError.message, details: retryError.details, hint: retryError.hint });
          return fail(500, "Could not register upload");
        }
      } else {
        return fail(500, "Could not register upload");
      }
    }

    const [o, t] = await Promise.all([db.storage.from("photos").createSignedUploadUrl(path), db.storage.from("photos").createSignedUploadUrl(thumbPath)]);
    if (o.error || t.error || !o.data || !t.data) {
      console.error("Signed URL creation failed:", { original: o.error, thumb: t.error });
      return fail(500, "Could not authorize upload");
    }

    const uploadData: { photoId: string; original: { path: string; token: string }; thumb: { path: string; token: string }; video?: { path: string; token: string } } = {
      photoId,
      original: { path, token: o.data.token },
      thumb: { path: thumbPath, token: t.data.token },
    };

    // Only create video upload URL if we successfully inserted video columns
    if (mediaType === "video" && videoPath && insertData.video_path) {
      const v = await db.storage.from("photos").createSignedUploadUrl(videoPath);
      if (v.error || !v.data) {
        console.error("Video signed URL creation failed:", v.error);
        return fail(500, "Could not authorize video upload");
      }
      uploadData.video = { path: videoPath, token: v.data.token };
    }

    out.push(uploadData);
  }
  return NextResponse.json({ uploads: out });
}
