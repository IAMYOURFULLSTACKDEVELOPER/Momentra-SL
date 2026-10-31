"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, Video } from "lucide-react";

type P = { id: string; thumbUrl: string | null; fullUrl: string | null; videoUrl: string | null; createdAt: string; width: number | null; height: number | null; mediaType: "photo" | "video" };

export function GuestGallery({ token }: { token: string }) {
  const [photos, setPhotos] = useState<P[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [lb, setLb] = useState<number | null>(null);

  const load = useCallback(async (c: string | null) => {
    const res = await fetch(`/api/event/${token}/photos${c ? `?cursor=${encodeURIComponent(c)}` : ""}`);
    const j = await res.json();
    if (!res.ok) { setMsg(j.error ?? "Could not load the gallery."); setState("error"); return; }
    setPhotos((cur) => (c ? [...cur, ...j.photos] : j.photos)); setCursor(j.nextCursor); setTotal(j.total); setState("ready");
  }, [token]);
  useEffect(() => { void load(null); }, [load]);
  useEffect(() => {
    if (lb === null) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setLb(null); if (e.key === "ArrowRight") setLb((i) => (i === null ? i : Math.min(photos.length - 1, i + 1))); if (e.key === "ArrowLeft") setLb((i) => (i === null ? i : Math.max(0, i - 1))); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [lb, photos.length]);

  async function report(id: string) {
    const reason = window.prompt("What is wrong with this photo?"); if (!reason) return;
    await fetch(`/api/event/${token}/photos/${id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    window.alert("Thanks — the organizers have been notified.");
  }
  if (state === "loading") return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-stone-200" />)}</div>;
  if (state === "error") return <p role="alert" className="card text-center">{msg}</p>;
  if (!photos.length) return <p className="card text-center text-stone-600">No photos yet. Be the first to share one!</p>;
  const cur = lb === null ? null : photos[lb];
  return (
    <>
      <p className="mb-3 text-sm text-stone-600">{total} photo{total === 1 ? "" : "s"}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (<li key={p.id} className="relative"><button className="block aspect-square w-full overflow-hidden rounded-xl bg-stone-200" onClick={() => setLb(i)} aria-label="Open photo">{p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}{p.mediaType === "video" && <Video className="absolute bottom-1 right-1 h-4 w-4 text-white drop-shadow" />}</button></li>))}
      </ul>
      {cursor && <div className="mt-6 text-center"><button className="btn-ghost" onClick={() => void load(cursor)}>Load more</button></div>}
      {cur && (
        <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <button className="absolute right-3 top-3 text-white" aria-label="Close" onClick={() => setLb(null)}><X /></button>
          {lb! > 0 && <button className="absolute left-2 text-white" aria-label="Previous" onClick={() => setLb(lb! - 1)}><ChevronLeft className="h-8 w-8" /></button>}
          {cur.mediaType === "video" && cur.videoUrl ? (
            <video src={cur.videoUrl} controls autoPlay className="max-h-[90vh] max-w-[95vw]" />
          ) : cur.fullUrl ? (
            <img src={cur.fullUrl} alt="" className="max-h-[90vh] max-w-[95vw] object-contain" />
          ) : null}
          {lb! < photos.length - 1 && <button className="absolute right-2 text-white" aria-label="Next" onClick={() => setLb(lb! + 1)}><ChevronRight className="h-8 w-8" /></button>}
          <div className="absolute bottom-4 flex items-center gap-4 text-sm text-white"><span>{new Date(cur.createdAt).toLocaleString()}</span><button className="underline" onClick={() => void report(cur.id)}>Report</button></div>
        </div>
      )}
    </>
  );
}
