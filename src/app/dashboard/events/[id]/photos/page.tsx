import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhotoManager } from "@/components/PhotoManager";

const PAGE = 60;
export default async function PhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const { id } = await params; const { before } = await searchParams;
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("id,title,moderation_enabled").eq("id", id).maybeSingle(); // RLS
  if (!e) notFound();
  let q = supabase.from("photos").select("id,approval_status,created_at,storage_path,thumb_path").eq("event_id", id).eq("state", "ready").order("created_at", { ascending: false }).limit(PAGE + 1);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  const { data } = await q;
  const rows = (data ?? []).slice(0, PAGE);
  const paths = rows.flatMap((r) => [r.thumb_path, r.storage_path]);
  const signed = paths.length ? (await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data ?? [] : []; // storage RLS: members only
  const map = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const { count } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", id).eq("state", "ready");
  const { count: pending } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", id).eq("state", "ready").eq("approval_status", "pending");
  return (
    <>
      <Link href={`/dashboard/events/${id}`} className="text-sm text-stone-600">← {e.title}</Link>
      <h1 className="mb-1 mt-2 font-serif text-3xl">Photos</h1>
      <p className="mb-4 text-sm text-stone-600">{count ?? 0} total{e.moderation_enabled ? ` · ${pending ?? 0} awaiting approval` : ""}</p>
      <PhotoManager eventId={id} moderation={e.moderation_enabled} hasMore={(data?.length ?? 0) > PAGE} nextCursor={rows.at(-1)?.created_at ?? null}
        photos={rows.map((r) => ({ id: r.id, approval_status: r.approval_status, created_at: r.created_at, thumbUrl: map.get(r.thumb_path) ?? null, fullUrl: map.get(r.storage_path) ?? null }))} />
    </>
  );
}
