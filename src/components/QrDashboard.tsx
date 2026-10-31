"use client";
import { useEffect, useState } from "react";
import { Video, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type Photo = {
  id: string;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  thumbUrl: string | null;
  mediaType: "photo" | "video";
};

export function QrDashboard({ eventId }: { eventId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial photos
  useEffect(() => {
    async function fetchPhotos() {
      const supabase = createClient();
      const { data } = await supabase
        .from("photos")
        .select("id,approval_status,created_at,thumb_path,media_type,mime_type")
        .eq("event_id", eventId)
        .eq("state", "ready")
        .order("created_at", { ascending: false })
        .limit(12);

      if (data) {
        const paths = data.flatMap((r) => [r.thumb_path].filter((p): p is string => p !== null && p !== undefined));
        const signed = paths.length ? (await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data ?? [] : [];
        const map = new Map(signed.map((s) => [s.path, s.signedUrl]));

        setPhotos(
          data.map((r) => ({
            id: r.id,
            approval_status: r.approval_status,
            created_at: r.created_at,
            thumbUrl: map.get(r.thumb_path) ?? null,
            mediaType: (r.media_type || (r.mime_type?.startsWith("video/") ? "video" : "photo")) as "photo" | "video",
          }))
        );
      }
      setLoading(false);
    }

    void fetchPhotos();
  }, [eventId]);

  // Real-time updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`photos-dashboard-${eventId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "photos", filter: `event_id=eq.${eventId}` },
        async (payload) => {
          const newPhoto = payload.new as { id: string; state: string; approval_status: string; created_at: string; thumb_path: string; media_type: string | null; mime_type: string | null };
          if (newPhoto.state === "ready") {
            const { data } = await supabase.storage.from("photos").createSignedUrls([newPhoto.thumb_path], 3600);
            const thumbUrl = data?.[0]?.signedUrl ?? null;

            setPhotos((prev) => [
              {
                id: newPhoto.id,
                approval_status: newPhoto.approval_status as "pending" | "approved" | "rejected",
                created_at: newPhoto.created_at,
                thumbUrl,
                mediaType: (newPhoto.media_type || (newPhoto.mime_type?.startsWith("video/") ? "video" : "photo")) as "photo" | "video",
              },
              ...prev.slice(0, 11), // Keep only 12 most recent
            ]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "photos", filter: `event_id=eq.${eventId}` },
        (payload) => {
          const updated = payload.new as { id: string; approval_status: string };
          setPhotos((prev) => prev.map((p) => (p.id === updated.id ? { ...p, approval_status: updated.approval_status as "pending" | "approved" | "rejected" } : p)));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const badge = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  } as const;

  if (loading) {
    return (
      <div className="card">
        <h2 className="font-serif text-xl">Live Guest Uploads</h2>
        <p className="mt-4 text-center text-stone-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl">Live Guest Uploads</h2>
        <div className="flex items-center gap-1 text-xs text-stone-500">
          <Clock className="h-3 w-3" />
          Real-time
        </div>
      </div>
      {!photos.length ? (
        <p className="text-center text-stone-600">No photos uploaded yet. Share the QR code with your guests!</p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-stone-200">
                {p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                {p.mediaType === "video" && <Video className="absolute bottom-1 right-1 h-4 w-4 text-white drop-shadow" />}
                <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] ${badge[p.approval_status]}`}>
                  {p.approval_status === "pending" && <AlertCircle className="inline h-3 w-3" />}
                  {p.approval_status === "approved" && <CheckCircle2 className="inline h-3 w-3" />}
                  {p.approval_status === "rejected" && <AlertCircle className="inline h-3 w-3" />}
                  {p.approval_status}
                </span>
                <div className="absolute top-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">{formatTime(p.created_at)}</div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-stone-500">
            Showing {photos.length} most recent upload{photos.length !== 1 ? "s" : ""} ·{" "}
            <a href={`/dashboard/events/${eventId}/photos`} className="text-stone-700 underline">
              View all photos
            </a>
          </p>
        </>
      )}
    </div>
  );
}
