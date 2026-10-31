import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("id,title,bride_name,groom_name,event_date,status").order("event_date", { ascending: false });
  return (
    <>
      <div className="flex items-center justify-between"><h1 className="font-serif text-3xl">Your events</h1><Link href="/dashboard/events/new" className="btn-primary">New event</Link></div>
      {!events?.length ? (
        <div className="card mt-8 text-center"><p className="font-serif text-xl">No events yet</p><p className="mt-1 text-sm text-stone-600">Create one to get your QR code.</p></div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id} className="card">
              <p className="text-xs uppercase tracking-wide text-stone-500">{e.status} · {e.event_date}</p>
              <h2 className="mt-1 font-serif text-xl">{e.title}</h2><p className="text-sm text-stone-600">{e.bride_name} & {e.groom_name}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm"><Link className="btn-ghost" href={`/dashboard/events/${e.id}`}>Manage</Link><Link className="btn-ghost" href={`/dashboard/events/${e.id}/qr`}>QR code</Link><Link className="btn-ghost" href={`/dashboard/events/${e.id}/photos`}>Photos</Link></div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
