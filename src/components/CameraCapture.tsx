"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";

/** Opens the camera only after an explicit tap, prefers the rear camera, and always releases the tracks. */
export function CameraCapture({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) return setError("Camera is not supported here. Use “Choose Photos” instead.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
      if (video.current) { video.current.srcObject = stream.current; await video.current.play(); }
    } catch { setError("Camera access was denied or is unavailable. You can still choose photos from your library."); }
  }
  useEffect(() => { void start(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  function capture() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { setShot({ blob: b, url: URL.createObjectURL(b) }); stop(); } }, "image/jpeg", 0.92);
  }
  const retake = () => { setShot(null); void start(); };
  const close = () => { stop(); onClose(); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-50 flex flex-col bg-black">
      <button onClick={close} aria-label="Close camera" className="absolute right-3 top-3 z-10 rounded-full bg-white/20 p-2 text-white"><X /></button>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {error ? <p className="max-w-xs p-6 text-center text-white">{error}</p> : shot ? <img src={shot.url} alt="Captured preview" className="max-h-full" /> : <video ref={video} playsInline muted className="max-h-full" />}
      </div>
      <div className="flex justify-center gap-4 p-6">
        {shot ? (<>
          <button className="btn-ghost" onClick={retake}><RefreshCw className="h-4 w-4" />Retake</button>
          <button className="btn-primary" onClick={() => { onCapture(new File([shot.blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" })); close(); }}>Use photo</button>
        </>) : !error && <button onClick={capture} aria-label="Take photo" className="h-16 w-16 rounded-full border-4 border-white bg-white/90" />}
      </div>
    </div>
  );
}
