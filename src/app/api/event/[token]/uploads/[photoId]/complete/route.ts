import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventByToken } from "@/lib/guestEvent";
import { fail, parseBody } from "@/lib/http";
import { uploadCompleteSchema } from "@/lib/validation";
import { sniffImage } from "@/lib/imageSniff";

export const runtime = "nodejs";

/** Step 2: confirm the objects really exist and are real images BEFORE reporting success. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await ctx.params;
  const body = await parseBody(req, uploadCompleteSchema);
  if ("res" in body) return body.res;
  if (body.data.photoId !== photoId) return fail(400, "Mismatched photo id");

  const event = await getEventByToken(token);
  if (!event) return fail(404, "Event not found");
  const db = createAdminClient();

  const { data: photo } = await db.from("photos").select("id,event_id,storage_path,thumb_path,video_path,state,mime_type,upload_session_id,media_type").eq("id", photoId).eq("event_id", event.id).maybeSingle();
  if (!photo || photo.state !== "uploading") return fail(404, "Upload not found");
  const { data: session } = await db.from("upload_sessions").select("guest_identifier").eq("id", photo.upload_session_id).maybeSingle();
  if (!session || session.guest_identifier !== body.data.guestId) return fail(403, "Not your upload"); // guests cannot finalize each other's uploads

  const mediaType = body.data.mediaType || photo.media_type || (photo.mime_type.startsWith("video/") ? "video" : "photo");

  const reject = async (reason: string, status = 422) => {
    const pathsToRemove = [photo.storage_path, photo.thumb_path];
    if (photo.video_path) pathsToRemove.push(photo.video_path);
    await db.storage.from("photos").remove(pathsToRemove);
    await db.from("photos").update({ state: "failed", failure_reason: reason }).eq("id", photo.id);
    return fail(status, reason);
  };

  const [orig, thumb] = await Promise.all([db.storage.from("photos").download(photo.storage_path), db.storage.from("photos").download(photo.thumb_path)]);
  if (orig.error || !orig.data) return reject("The file did not finish uploading.");
  if (thumb.error || !thumb.data) return reject("The preview did not finish uploading.");
  if (orig.data.size > event.max_file_bytes) return reject("File is too large.", 413);

  if (mediaType === "photo") {
    const origBytes = new Uint8Array(await orig.data.arrayBuffer());
    const thumbBytes = new Uint8Array(await thumb.data.slice(0, 16).arrayBuffer());
    const kind = sniffImage(origBytes.subarray(0, 16));
    if (!kind || kind !== photo.mime_type) return reject("File is not a valid JPEG, PNG or WebP image.");
    if (sniffImage(thumbBytes) !== "image/jpeg") return reject("Invalid preview image.");
  }

  const updateData: {
    state: string;
    file_size_bytes: number;
    approval_status: string;
    width?: number;
    height?: number;
    duration_ms?: number;
  } = {
    state: "ready",
    file_size_bytes: orig.data.size,
    approval_status: event.moderation_enabled ? "pending" : "approved",
  };

  if (mediaType === "photo" && body.data.width && body.data.height) {
    updateData.width = body.data.width;
    updateData.height = body.data.height;
  }

  if (mediaType === "video" && body.data.duration) {
    updateData.duration_ms = body.data.duration;
  }

  const { error } = await db.from("photos").update(updateData).eq("id", photo.id).eq("state", "uploading");
  if (error) return fail(500, "Could not save photo");
  return NextResponse.json({ ok: true, pendingApproval: event.moderation_enabled });
}
