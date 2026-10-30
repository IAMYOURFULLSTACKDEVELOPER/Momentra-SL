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

  const { data: photo } = await db.from("photos").select("id,event_id,storage_path,thumb_path,state,mime_type,upload_session_id").eq("id", photoId).eq("event_id", event.id).maybeSingle();
  if (!photo || photo.state !== "uploading") return fail(404, "Upload not found");
  const { data: session } = await db.from("upload_sessions").select("guest_identifier").eq("id", photo.upload_session_id).maybeSingle();
  if (!session || session.guest_identifier !== body.data.guestId) return fail(403, "Not your upload"); // guests cannot finalize each other's uploads

  const reject = async (reason: string, status = 422) => {
    await db.storage.from("photos").remove([photo.storage_path, photo.thumb_path]);
    await db.from("photos").update({ state: "failed", failure_reason: reason }).eq("id", photo.id);
    return fail(status, reason);
  };

  const [orig, thumb] = await Promise.all([db.storage.from("photos").download(photo.storage_path), db.storage.from("photos").download(photo.thumb_path)]);
  if (orig.error || !orig.data) return reject("The photo did not finish uploading.");
  if (thumb.error || !thumb.data) return reject("The preview did not finish uploading.");
  if (orig.data.size > event.max_file_bytes) return reject("Photo is too large.", 413);

  const origBytes = new Uint8Array(await orig.data.arrayBuffer());
  const thumbBytes = new Uint8Array(await thumb.data.slice(0, 16).arrayBuffer());
  const kind = sniffImage(origBytes.subarray(0, 16));
  if (!kind || kind !== photo.mime_type) return reject("File is not a valid JPEG, PNG or WebP image.");
  if (sniffImage(thumbBytes) !== "image/jpeg") return reject("Invalid preview image.");

  const { error } = await db.from("photos").update({
    state: "ready", file_size_bytes: orig.data.size, width: body.data.width, height: body.data.height,
    approval_status: event.moderation_enabled ? "pending" : "approved",
  }).eq("id", photo.id).eq("state", "uploading");
  if (error) return fail(500, "Could not save photo");
  return NextResponse.json({ ok: true, pendingApproval: event.moderation_enabled });
}
