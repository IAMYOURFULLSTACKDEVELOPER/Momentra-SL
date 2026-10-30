"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw, X, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { prepareImage } from "@/lib/imageClient";
import { ALLOWED_MIME } from "@/lib/validation";
import { CameraCapture } from "./CameraCapture";

type Item = { id: string; file: File; status: "ready" | "uploading" | "done" | "error"; error?: string; previewUrl?: string; prepared?: Awaited<ReturnType<typeof prepareImage>> };
const CONCURRENCY = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function guestId() {
  try { let id = localStorage.getItem("ws_guest"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("ws_guest", id); } return id; } catch { return crypto.randomUUID(); }
}

export function GuestUploader({ token, maxFileBytes, open, closedReason, pendingNote }: { token: string; maxFileBytes: number; open: boolean; closedReason?: string; pendingNote: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // guards against double-clicks before state updates land
  const patch = useCallback((id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i))), []);
  useEffect(() => () => items.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(files: File[]) {
    const next: Item[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) { next.push({ id, file, status: "error", error: "Only JPEG, PNG or WebP photos are supported." }); continue; }
      if (file.size > 40 * 1024 * 1024) { next.push({ id, file, status: "error", error: "This photo is too large." }); continue; }
      next.push({ id, file, status: "ready", previewUrl: URL.createObjectURL(file) });
    }
    setItems((c) => [...c, ...next]);
  }

  async function uploadOne(it: Item, token_: string, attempt = 0): Promise<void> {
    const supabase = createClient();
    try {
      patch(it.id, { status: "uploading", error: undefined });
      const p = it.prepared ?? (await prepareImage(it.file)); patch(it.id, { prepared: p });
      if (p.original.size > maxFileBytes) throw new Fatal(`Photo is larger than ${Math.floor(maxFileBytes / 1048576)} MB.`);
      const init = await fetch(`/api/event/${token_}/uploads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId: guestId(), files: [{ name: it.file.name, size: p.original.size, mime: p.mime }] }) });
      const initJson = await init.json();
      if (!init.ok) throw init.status >= 500 ? new Error(initJson.error) : new Fatal(initJson.error ?? "Upload refused");
      const u = initJson.uploads[0];
      const a = await supabase.storage.from("photos").uploadToSignedUrl(u.original.path, u.original.token, p.original, { contentType: p.mime });
      if (a.error) throw new Error(a.error.message);
      const b = await supabase.storage.from("photos").uploadToSignedUrl(u.thumb.path, u.thumb.token, p.thumb, { contentType: "image/jpeg" });
      if (b.error) throw new Error(b.error.message);
      const done = await fetch(`/api/event/${token_}/uploads/${u.photoId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId: guestId(), photoId: u.photoId, width: p.width, height: p.height }) });
      if (!done.ok) { const j = await done.json(); throw done.status >= 500 ? new Error(j.error) : new Fatal(j.error ?? "Upload failed"); }
      patch(it.id, { status: "done" }); // success only after the server confirmed storage + database
    } catch (e) {
      if (!(e instanceof Fatal) && attempt < 2) { await sleep(800 * 2 ** attempt); return uploadOne(it, token_, attempt + 1); } // backoff for transient failures
      patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function run(list: Item[]) {
    if (busyRef.current || !list.length) return;
    busyRef.current = true; setBusy(true);
    const queue = [...list];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => { for (let it = queue.shift(); it; it = queue.shift()) await uploadOne(it, token); }));
    busyRef.current = false; setBusy(false);
  }

  const pending = items.filter((i) => i.status === "ready");
  const done = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "error").length;

  if (!open) return <p className="card text-center text-stone-600" role="status">{closedReason}</p>;
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-primary h-14 text-base" onClick={() => setCamera(true)}><Camera className="h-5 w-5" />Take a Photo</button>
        <label className="btn-ghost h-14 cursor-pointer text-base"><ImagePlus className="h-5 w-5" />Choose Photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
      </div>
      {camera && <CameraCapture onClose={() => setCamera(false)} onCapture={(f) => void addFiles([f])} />}
      {items.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((i) => (
              <li key={i.id} className="relative aspect-square overflow-hidden rounded-xl bg-stone-200">
                {i.previewUrl && <img src={i.previewUrl} alt="" className="h-full w-full object-cover" />}
                {i.status === "uploading" && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white" role="status">Uploading…</div>}
                {i.status === "done" && <CheckCircle2 className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white text-green-600" aria-label="Uploaded" />}
                {i.status === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/80 p-1 text-center text-[11px] text-white" role="alert">{i.error}</div>}
                {(i.status === "ready" || i.status === "error") && <button aria-label="Remove photo" className="absolute left-1 top-1 rounded-full bg-white/90 p-1" onClick={() => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl); setItems((c) => c.filter((x) => x.id !== i.id)); }}><X className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || !pending.length} onClick={() => void run(pending)}>{busy ? "Uploading…" : `Upload ${pending.length} photo${pending.length === 1 ? "" : "s"}`}</button>
            {failedCount > 0 && !busy && <button className="btn-ghost" onClick={() => void run(items.filter((i) => i.status === "error" && i.file && (ALLOWED_MIME as readonly string[]).includes(i.file.type)))}><RotateCcw className="h-4 w-4" />Retry failed ({failedCount})</button>}
            <p className="text-sm text-stone-600" role="status">{done} uploaded{failedCount ? `, ${failedCount} failed` : ""}</p>
          </div>
          {pendingNote && done > 0 && <p className="text-sm text-stone-600">Photos appear in the gallery once the couple approves them.</p>}
        </>
      )}
      <p className="text-xs text-stone-500">Photos you upload are visible to the event organizers. Please only share photos you are happy for the couple to keep.</p>
    </section>
  );
}
class Fatal extends Error {}
