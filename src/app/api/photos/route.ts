import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, parseBody } from "@/lib/http";
import { idsSchema, moderateSchema } from "@/lib/validation";

/** Moderation. Runs as the signed-in user so RLS decides what they may touch; a DB trigger writes the audit log. */
export async function PATCH(req: Request) {
  const body = await parseBody(req, moderateSchema);
  if ("res" in body) return body.res;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in required");
  const { data, error } = await supabase.from("photos").update({ approval_status: body.data.approvalStatus }).in("id", body.data.ids).select("id");
  if (error) return fail(400, "Update failed");
  return NextResponse.json({ updated: data.length });
}

export async function DELETE(req: Request) {
  const body = await parseBody(req, idsSchema);
  if ("res" in body) return body.res;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in required");
  const { data: rows } = await supabase.from("photos").select("id,event_id,storage_path,thumb_path").in("id", body.data.ids); // RLS-filtered
  if (!rows?.length) return fail(404, "Nothing to delete");
  const { error } = await supabase.from("photos").delete().in("id", rows.map((r) => r.id)); // RLS: managers only
  if (error) return fail(400, "Delete failed");
  await createAdminClient().storage.from("photos").remove(rows.flatMap((r) => [r.storage_path, r.thumb_path]));
  const admin = createAdminClient();
  await admin.from("audit_logs").insert(rows.map((r) => ({ actor_id: user.id, event_id: r.event_id, action: "photo.deleted", metadata: { photo_id: r.id } })));
  return NextResponse.json({ deleted: rows.length });
}
