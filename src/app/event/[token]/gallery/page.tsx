import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventByToken } from "@/lib/guestEvent";
import { GuestGallery } from "@/components/GuestGallery";

export const dynamic = "force-dynamic";
export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const e = await getEventByToken(token);
  if (!e) notFound();
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <Link href={`/event/${token}`} className="text-sm text-stone-600">← Back to upload</Link>
      <h1 className="mb-6 mt-2 font-serif text-3xl">{e.bride_name} & {e.groom_name}</h1>
      {e.visibility === "guests" ? <GuestGallery token={token} /> : <p className="card text-center text-stone-600">The couple has kept this gallery private.</p>}
    </main>
  );
}
