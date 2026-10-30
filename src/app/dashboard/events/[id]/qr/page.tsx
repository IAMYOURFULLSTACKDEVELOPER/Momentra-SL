import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QrManager } from "@/components/QrManager";

export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("id,title,bride_name,groom_name,public_token").eq("id", id).maybeSingle();
  if (!e) notFound();
  return (<><Link href={`/dashboard/events/${id}`} className="text-sm text-stone-600">← {e.title}</Link><h1 className="mb-6 mt-2 font-serif text-3xl">QR code</h1>
    <QrManager eventId={e.id} initialToken={e.public_token} title={e.title} couple={`${e.bride_name} & ${e.groom_name}`} /></>);
}
