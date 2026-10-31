"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Video, StopCircle } from "lucide-react";

type MediaType = "photo" | "video";

/** Opens the camera only after an explicit tap, prefers the rear camera, and always releases the tracks. */
export function CameraCapture({ onCapture, onClose }: { onCapture: (file: File, type: MediaType) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string; type: MediaType } | null>(null);
  const [mode, setMode] = useState<MediaType>("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
  };

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) return setError("Camera is not supported here. Use \"Choose Photos\" instead.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: mode === "video"
      });
      if (video.current) { video.current.srcObject = stream.current; await video.current.play(); }
    } catch { setError("Camera access was denied or is unavailable. You can still choose photos from your library."); }
  }

  useEffect(() => { void start(); return stop; }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  function capture() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { setShot({ blob: b, url: URL.createObjectURL(b), type: "photo" }); stop(); } }, "image/jpeg", 0.92);
  }

  function startRecording() {
    if (!stream.current) return;
    recordedChunks.current = [];
    const options = { mimeType: "video/webm;codecs=vp9" };
    try {
      mediaRecorder.current = new MediaRecorder(stream.current, options);
    } catch {
      mediaRecorder.current = new MediaRecorder(stream.current);
    }
    mediaRecorder.current.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
    mediaRecorder.current.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: "video/webm" });
      setShot({ blob, url: URL.createObjectURL(blob), type: "video" });
      stop();
    };
    mediaRecorder.current.start();
    setIsRecording(true);
    setRecordingTime(0);
  }

  function stopRecording() {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  }

  const retake = () => { setShot(null); setRecordingTime(0); void start(); };
  const close = () => { stop(); onClose(); };
  const switchMode = () => { setMode((m) => m === "photo" ? "video" : "photo"); setShot(null); setRecordingTime(0); };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-50 flex flex-col bg-black">
      <button onClick={close} aria-label="Close camera" className="absolute right-3 top-3 z-10 rounded-full bg-white/20 p-2 text-white"><X /></button>
      <button onClick={switchMode} aria-label={`Switch to ${mode === "photo" ? "video" : "photo"}`} className="absolute left-3 top-3 z-10 rounded-full bg-white/20 p-2 text-white">
        {mode === "photo" ? <Video className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      </button>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {error ? <p className="max-w-xs p-6 text-center text-white">{error}</p> : shot ? (
          shot.type === "video" ? <video src={shot.url} controls className="max-h-full" /> : <img src={shot.url} alt="Captured preview" className="max-h-full" />
        ) : (
          <div className="relative">
            <video ref={video} playsInline muted className="max-h-full" />
            {isRecording && <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-sm text-white flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              {formatTime(recordingTime)}
            </div>}
          </div>
        )}
      </div>
      <div className="flex justify-center gap-4 p-6">
        {shot ? (<>
          <button className="btn-ghost" onClick={retake}><RefreshCw className="h-4 w-4" />Retake</button>
          <button className="btn-primary" onClick={() => {
            const ext = shot.type === "video" ? "webm" : "jpg";
            const mime = shot.type === "video" ? "video/webm" : "image/jpeg";
            onCapture(new File([shot.blob], `camera-${Date.now()}.${ext}`, { type: mime }), shot.type);
            close();
          }}>Use {shot.type}</button>
        </>) : !error && (
          <>
            {mode === "photo" ? (
              <button onClick={capture} aria-label="Take photo" className="h-16 w-16 rounded-full border-4 border-white bg-white/90" />
            ) : (
              <button onClick={isRecording ? stopRecording : startRecording} aria-label={isRecording ? "Stop recording" : "Start recording"} className={`h-16 w-16 rounded-full border-4 ${isRecording ? "bg-red-600 border-red-500" : "bg-white/90 border-white"}`}>
                {isRecording ? <StopCircle className="h-8 w-8 text-white" /> : <Video className="h-8 w-8" />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
