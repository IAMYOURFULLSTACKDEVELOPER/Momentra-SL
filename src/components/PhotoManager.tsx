"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export type OrgPhoto = { id: string; approval_status: "pending" | "approved" | "rejected"; created_at: string; thumbUrl: string | null; fullUrl: string | null };

export function PhotoManager({ eventId, photos, moderation, hasMore, nextCursor }: { eventId: string; photos: OrgPhoto[]; moderation: boolean; hasMore: boolean; nextCursor: string | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lb, setLb] = useState<OrgPhoto | null>(null);

  // Realtime: RLS applies to realtime changes too, so only rows this user can read are delivered.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`photos-${eventId}`).on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${eventId}` }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [eventId, router]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...sel];
  async function call(method: "PATCH" | "DELETE", body: object) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/photos", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setMsg((await res.json()).error ?? "Action failed");
    setSel(new Set()); router.refresh();
  }
  async function zip() {
    setBusy(true); setMsg("Preparing archive…");
    const res = await fetch("/api/photos/zip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    setBusy(false);
    if (!res.ok) return setMsg((await res.json()).error ?? "Archive failed");
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "wedding-photos.zip"; a.click(); URL.revokeObjectURL(url); setMsg(null);
  }
  const badge = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800" } as const;
  return (
    <>
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white/90 p-3 shadow-sm backdrop-blur">
        <span className="text-sm">{sel.size} selected</span>
        <button className="btn-ghost" onClick={() => setSel(new Set(photos.map((p) => p.id)))}>Select all</button>
        {moderation && <><button className="btn-ghost" disabled={!sel.size || busy} onClick={() => call("PATCH", { ids, approvalStatus: "approved" })}><Check className="h-4 w-4" />Approve</button>
          <button className="btn-ghost" disabled={!sel.size || busy} onClick={() => call("PATCH", { ids, approvalStatus: "rejected" })}><X className="h-4 w-4" />Reject</button></>}
        <button className="btn-ghost" disabled={!sel.size || busy} onClick={zip}><Download className="h-4 w-4" />ZIP</button>
        <button className="btn-danger" disabled={!sel.size || busy} onClick={() => window.confirm(`Permanently delete ${sel.size} photo(s)? This cannot be undone.`) && call("DELETE", { ids })}><Trash2 className="h-4 w-4" />Delete</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
      {!photos.length ? <p className="card text-center text-stone-600">No photos yet.</p> : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((p) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-stone-200">
              <button className="h-full w-full" onClick={() => setLb(p)} aria-label="Open photo">{p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}</button>
              <input type="checkbox" aria-label="Select photo" className="absolute left-2 top-2 h-5 w-5" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
              <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] ${badge[p.approval_status]}`}>{p.approval_status}</span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && nextCursor && <div className="mt-6 text-center"><a className="btn-ghost" href={`?before=${encodeURIComponent(nextCursor)}`}>Older photos</a></div>}
      {lb && (<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLb(null)}>
        {lb.fullUrl && <img src={lb.fullUrl} alt="" className="max-h-[90vh] max-w-[95vw] object-contain" />}
        <a className="btn-primary absolute bottom-4" href={`/api/photos/download?id=${lb.id}`} onClick={(e) => e.stopPropagation()}><Download className="h-4 w-4" />Download</a>
        <button className="absolute right-3 top-3 text-white" aria-label="Close"><X /></button></div>)}
    </>
  );
}
