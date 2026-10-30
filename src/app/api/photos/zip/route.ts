import { zipSync } from "fflate";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, parseBody } from "@/lib/http";
import { idsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;
// Archives are built in memory, so they are capped. Larger exports need a background job (see README).
const MAX_FILES = 60;
const MAX_BYTES = 250 * 1024 * 1024;

export async function POST(req: Request) {
  const body = await parseBody(req, idsSchema);
  if ("res" in body) return body.res;
  if (body.data.ids.length > MAX_FILES) return fail(413, `Select at most ${MAX_FILES} photos per archive.`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in required");
  const { data: rows } = await supabase.from("photos").select("id,event_id,storage_path,file_size_bytes").in("id", body.data.ids).eq("state", "ready"); // RLS-filtered
  if (!rows?.length) return fail(404, "No photos available");
  if (rows.reduce((n, r) => n + Number(r.file_size_bytes), 0) > MAX_BYTES) return fail(413, "Selection is too large for one archive; choose fewer photos.");

  const admin = createAdminClient();
  const files: Record<string, Uint8Array> = {};
  for (const r of rows) {
    const { data, error } = await admin.storage.from("photos").download(r.storage_path);
    if (error || !data) return fail(502, "Could not read one of the photos");
    files[`photo-${r.id.slice(0, 8)}.${r.storage_path.split(".").pop()}`] = new Uint8Array(await data.arrayBuffer());
  }
  await admin.from("audit_logs").insert({ actor_id: user.id, event_id: rows[0]!.event_id, action: "photos.zip_download", metadata: { count: rows.length } });
  const zip = zipSync(files, { level: 0 }); // JPEG/PNG/WebP are already compressed
  return new Response(zip, { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="wedding-photos.zip"', "Cache-Control": "no-store" } });
}
