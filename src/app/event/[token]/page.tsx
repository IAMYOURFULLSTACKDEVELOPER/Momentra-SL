import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventByToken, uploadsOpen } from "@/lib/guestEvent";
import { GuestUploader } from "@/components/GuestUploader";

export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const e = await getEventByToken(token);
  if (!e) notFound();
  const gate = uploadsOpen(e);
  const date = new Date(e.event_date + "T00:00:00").toLocaleDateString(undefined, { dateStyle: "long" });
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <header className="mb-8 text-center">
        <p className="text-xs uppercase tracking-widest text-stone-500">{date}{e.venue && ` · ${e.venue}`}</p>
        <h1 className="mt-2 font-serif text-4xl">{e.bride_name} & {e.groom_name}</h1>
        <p className="mt-1 font-serif text-lg text-stone-600">{e.title}</p>
        <p className="mt-4 text-stone-700">{e.description || "Share the moments you captured with us. Thank you for celebrating with us!"}</p>
      </header>
      <GuestUploader token={token} maxFileBytes={e.max_file_bytes} open={gate.open} closedReason={gate.reason} pendingNote={e.moderation_enabled} />
      {e.visibility === "guests" && <p className="mt-8 text-center"><Link className="btn-ghost" href={`/event/${token}/gallery`}>View the shared gallery</Link></p>}
    </main>
  );
}
