import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/EventForm";

export default async function ManageEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle(); // RLS: owners/collaborators only
  if (!e) notFound();
  const { data: used } = await supabase.from("photos").select("file_size_bytes").eq("event_id", id).in("state", ["uploading", "ready"]);
  const bytes = (used ?? []).reduce((n, r) => n + Number(r.file_size_bytes), 0);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">{e.title}</h1>
        <div className="flex gap-2"><Link className="btn-ghost" href={`/dashboard/events/${id}/qr`}>QR code</Link><Link className="btn-ghost" href={`/dashboard/events/${id}/photos`}>Photos</Link></div>
      </div>
      <p className="mb-4 text-sm text-stone-600">Storage used: {(bytes / 1048576).toFixed(1)} MB of {(Number(e.storage_quota_bytes) / 1073741824).toFixed(1)} GB</p>
      <EventForm eventId={id} defaults={{
        title: e.title, brideName: e.bride_name, groomName: e.groom_name, eventDate: e.event_date, venue: e.venue, description: e.description,
        visibility: e.visibility, moderationEnabled: e.moderation_enabled, status: e.status === "suspended" ? "archived" : e.status,
        uploadDeadline: e.upload_deadline ? new Date(e.upload_deadline).toISOString().slice(0, 16) : "",
      }} />
    </>
  );
}
