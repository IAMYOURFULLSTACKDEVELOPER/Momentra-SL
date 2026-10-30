import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail } from "@/lib/http";

/** Single download: RLS-checked lookup, then a 60-second signed URL that forces a download. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return fail(400, "Invalid id");
  const supabase = await createClient();
  const { data: photo } = await supabase.from("photos").select("storage_path,mime_type").eq("id", id).eq("state", "ready").maybeSingle();
  if (!photo) return fail(404, "Not found");
  const ext = photo.storage_path.split(".").pop();
  const { data, error } = await supabase.storage.from("photos").createSignedUrl(photo.storage_path, 60, { download: `wedding-photo-${id.slice(0, 8)}.${ext}` });
  if (error || !data) return fail(500, "Could not create download link");
  return NextResponse.redirect(data.signedUrl);
}
