"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw, X, CheckCircle2, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { prepareImage } from "@/lib/imageClient";
import { ALLOWED_MIME } from "@/lib/validation";
import { CameraCapture } from "./CameraCapture";

type MediaType = "photo" | "video";
type Item = { id: string; file: File; mediaType: MediaType; status: "ready" | "uploading" | "done" | "error"; error?: string; previewUrl?: string; prepared?: Awaited<ReturnType<typeof prepareImage>>; duration?: number };
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

  async function addFiles(files: File[], mediaType: MediaType = "photo") {
    const next: Item[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) { next.push({ id, file, mediaType, status: "error", error: "Only JPEG, PNG, WebP photos and MP4/WebM videos are supported." }); continue; }
      if (file.size > 100 * 1024 * 1024) { next.push({ id, file, mediaType, status: "error", error: "This file is too large." }); continue; }
      next.push({ id, file, mediaType, status: "ready", previewUrl: URL.createObjectURL(file) });
    }
    setItems((c) => [...c, ...next]);
  }

  async function uploadOne(it: Item, token_: string, attempt = 0): Promise<void> {
    const supabase = createClient();
    try {
      patch(it.id, { status: "uploading", error: undefined });

      let mediaData: { original: Blob; thumb: Blob; mime: string; width?: number; height?: number; duration?: number };

      if (it.mediaType === "video") {
        // For videos, we don't process them like images
        const videoData = await createVideoThumbnail(it.file);
        mediaData = {
          original: it.file,
          thumb: videoData.blob,
          mime: it.file.type,
          width: videoData.width,
          height: videoData.height,
          duration: videoData.duration
        };
      } else {
        // For photos, use the existing prepareImage logic
        const p = it.prepared ?? (await prepareImage(it.file));
        patch(it.id, { prepared: p });
        mediaData = p;
      }

      if (mediaData.original.size > maxFileBytes) throw new Fatal(`File is larger than ${Math.floor(maxFileBytes / 1048576)} MB.`);

      const init = await fetch(`/api/event/${token_}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guestId(),
          files: [{
            name: it.file.name,
            size: mediaData.original.size,
            mime: mediaData.mime,
            mediaType: it.mediaType,
            duration: mediaData.duration
          }]
        })
      });
      const initJson = await init.json();
      if (!init.ok) {
        const errorMsg = initJson.error ?? "Upload refused";
        if (init.status === 413) throw new Fatal("File is too large");
        if (init.status === 429) throw new Fatal("You have reached the photo limit for this event");
        if (init.status === 403) throw new Fatal("Uploads are not currently accepted for this event");
        if (init.status === 404) throw new Fatal("Event not found");
        throw init.status >= 500 ? new Error(errorMsg) : new Fatal(errorMsg);
      }
      const u = initJson.uploads[0];

      // Upload original file
      const a = await supabase.storage.from("photos").uploadToSignedUrl(u.original.path, u.original.token, mediaData.original, { contentType: mediaData.mime });
      if (a.error) throw new Error(`Storage upload failed: ${a.error.message}`);

      // Upload thumbnail
      const b = await supabase.storage.from("photos").uploadToSignedUrl(u.thumb.path, u.thumb.token, mediaData.thumb, { contentType: "image/jpeg" });
      if (b.error) throw new Error(`Thumbnail upload failed: ${b.error.message}`);

      // Upload video file if it's a video
      if (it.mediaType === "video" && u.video) {
        const v = await supabase.storage.from("photos").uploadToSignedUrl(u.video.path, u.video.token, mediaData.original, { contentType: mediaData.mime });
        if (v.error) throw new Error(`Video upload failed: ${v.error.message}`);
      }

      // Complete upload
      const done = await fetch(`/api/event/${token_}/uploads/${u.photoId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guestId(),
          photoId: u.photoId,
          width: mediaData.width,
          height: mediaData.height,
          mediaType: it.mediaType,
          duration: mediaData.duration
        })
      });
      if (!done.ok) {
        const j = await done.json();
        const errorMsg = j.error ?? "Upload completion failed";
        throw done.status >= 500 ? new Error(errorMsg) : new Fatal(errorMsg);
      }
      patch(it.id, { status: "done" }); // success only after the server confirmed storage + database
    } catch (e) {
      if (!(e instanceof Fatal) && attempt < 2) { await sleep(800 * 2 ** attempt); return uploadOne(it, token_, attempt + 1); } // backoff for transient failures
      patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function createVideoThumbnail(file: File): Promise<{ blob: Blob; width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.currentTime = 1; // Capture frame at 1 second
      video.onloadedmetadata = () => {
        const duration = video.duration;
        video.onloadeddata = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve({ blob, width: video.videoWidth, height: video.videoHeight, duration: Math.round(duration * 1000) });
              } else {
                reject(new Error("Failed to create thumbnail"));
              }
            }, "image/jpeg", 0.8);
          } else {
            reject(new Error("Failed to get canvas context"));
          }
          URL.revokeObjectURL(video.src);
        };
      };
      video.onerror = () => reject(new Error("Failed to load video"));
    });
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
        <label className="btn-ghost h-14 cursor-pointer text-base"><ImagePlus className="h-5 w-5" />Choose Photos & Videos
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple className="sr-only" onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            const photos = files.filter(f => f.type.startsWith("image/"));
            const videos = files.filter(f => f.type.startsWith("video/"));
            void addFiles(photos, "photo");
            void addFiles(videos, "video");
            e.target.value = "";
          }} /></label>
      </div>
      {camera && <CameraCapture onClose={() => setCamera(false)} onCapture={(f, type) => void addFiles([f], type)} />}
      {items.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((i) => (
              <li key={i.id} className="relative aspect-square overflow-hidden rounded-xl bg-stone-200">
                {i.previewUrl && (
                  i.mediaType === "video" ? (
                    <video src={i.previewUrl} muted className="h-full w-full object-cover" />
                  ) : (
                    <img src={i.previewUrl} alt="" className="h-full w-full object-cover" />
                  )
                )}
                {i.mediaType === "video" && <Video className="absolute bottom-1 right-1 h-4 w-4 text-white drop-shadow" />}
                {i.status === "uploading" && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white" role="status">Uploading…</div>}
                {i.status === "done" && <CheckCircle2 className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white text-green-600" aria-label="Uploaded" />}
                {i.status === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/80 p-1 text-center text-[11px] text-white" role="alert">{i.error}</div>}
                {(i.status === "ready" || i.status === "error") && <button aria-label="Remove item" className="absolute left-1 top-1 rounded-full bg-white/90 p-1" onClick={() => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl); setItems((c) => c.filter((x) => x.id !== i.id)); }}><X className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || !pending.length} onClick={() => void run(pending)}>{busy ? "Uploading…" : `Upload ${pending.length} item${pending.length === 1 ? "" : "s"}`}</button>
            {failedCount > 0 && !busy && <button className="btn-ghost" onClick={() => void run(items.filter((i) => i.status === "error" && i.file && (ALLOWED_MIME as readonly string[]).includes(i.file.type)))}><RotateCcw className="h-4 w-4" />Retry failed ({failedCount})</button>}
            <p className="text-sm text-stone-600" role="status">{done} uploaded{failedCount ? `, ${failedCount} failed` : ""}</p>
          </div>
          {pendingNote && done > 0 && <p className="text-sm text-stone-600">Photos and videos appear in the gallery once the couple approves them.</p>}
        </>
      )}
      <p className="text-xs text-stone-500">Photos you upload are visible to the event organizers. Please only share photos you are happy for the couple to keep.</p>
    </section>
  );
}
class Fatal extends Error {}
