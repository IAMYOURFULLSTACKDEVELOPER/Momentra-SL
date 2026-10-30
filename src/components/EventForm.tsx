"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { eventSchema, type EventInput } from "@/lib/validation";
import { createClient } from "@/lib/supabase/browser";
import { Field } from "./AuthForm";

export function EventForm({ eventId, defaults }: { eventId?: string; defaults?: Partial<EventInput> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EventInput>({
    resolver: zodResolver(eventSchema),
    defaultValues: { title: "", brideName: "", groomName: "", eventDate: "", venue: "", description: "", visibility: "private", moderationEnabled: false, uploadDeadline: "", status: "active", ...defaults },
  });
  async function onSubmit(v: EventInput) {
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError("Please sign in again.");
    const row = {
      title: v.title, bride_name: v.brideName, groom_name: v.groomName, event_date: v.eventDate, venue: v.venue, description: v.description,
      visibility: v.visibility, moderation_enabled: v.moderationEnabled, status: v.status,
      upload_deadline: v.uploadDeadline ? new Date(v.uploadDeadline).toISOString() : null,
    };
    // RLS enforces ownership; the DB re-validates every constraint server-side.
    const res = eventId ? await supabase.from("events").update(row).eq("id", eventId).select("id").single() : await supabase.from("events").insert({ ...row, owner_id: user.id }).select("id").single();
    if (res.error) return setError(res.error.message);
    router.push(`/dashboard/events/${res.data.id}/qr`); router.refresh();
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2"><Field label="Event title" error={errors.title?.message}><input className="input" {...register("title")} /></Field></div>
      <Field label="Bride’s name" error={errors.brideName?.message}><input className="input" {...register("brideName")} /></Field>
      <Field label="Groom’s name" error={errors.groomName?.message}><input className="input" {...register("groomName")} /></Field>
      <Field label="Date" error={errors.eventDate?.message}><input className="input" type="date" {...register("eventDate")} /></Field>
      <Field label="Venue" error={errors.venue?.message}><input className="input" {...register("venue")} /></Field>
      <div className="sm:col-span-2"><Field label="Welcome message" error={errors.description?.message}><textarea className="input" rows={3} {...register("description")} /></Field></div>
      <Field label="Gallery visibility"><select className="input" {...register("visibility")}><option value="private">Private (organizers only)</option><option value="guests">Guests with the QR link can view</option></select></Field>
      <Field label="Status"><select className="input" {...register("status")}><option value="draft">Draft</option><option value="active">Active (accepting uploads)</option>{eventId && <><option value="completed">Completed</option><option value="archived">Archived</option></>}</select></Field>
      <Field label="Upload deadline (optional)" error={errors.uploadDeadline?.message}><input className="input" type="datetime-local" {...register("uploadDeadline")} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-4 w-4" {...register("moderationEnabled")} />Require approval before photos appear</label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving…" : eventId ? "Save changes" : "Create wedding"}</button></div>
    </form>
  );
}
