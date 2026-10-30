import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const mb = (b: number) => (b / 1048576).toFixed(1) + " MB";
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin"); // trusted server-side check against platform_admins
  if (!user || !isAdmin) notFound();
  const { data: s } = await supabase.rpc("admin_stats");
  const stats = s as Record<string, number>;
  const { data: reports } = await supabase.from("content_reports").select("id,photo_id,event_id,reason,status,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(50);
  const { data: logs } = await supabase.from("audit_logs").select("id,action,event_id,created_at").order("created_at", { ascending: false }).limit(25);
  const cards: [string, string | number][] = [["Organizers", stats.organizers!], ["Events", stats.events!], ["Active", stats.active_events!], ["Archived", stats.archived_events!], ["Photos", stats.photos!], ["Storage", mb(Number(stats.storage_bytes))], ["Failed uploads", stats.failed_uploads!], ["Open reports", stats.open_reports!]];
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-serif text-3xl">Platform admin</h1>
      <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{cards.map(([k, v]) => (<div key={k} className="card"><dt className="text-xs uppercase text-stone-500">{k}</dt><dd className="mt-1 font-serif text-2xl">{v}</dd></div>))}</dl>
      <h2 className="mb-2 mt-10 font-serif text-xl">Open reports</h2>
      {!reports?.length ? <p className="text-sm text-stone-600">No open reports.</p> : <ul className="space-y-2">{reports.map((r) => <li key={r.id} className="card py-3 text-sm">{r.reason} <span className="text-stone-500">· photo {r.photo_id.slice(0, 8)}</span></li>)}</ul>}
      <h2 className="mb-2 mt-10 font-serif text-xl">Recent audit records</h2>
      <ul className="space-y-1 text-sm">{(logs ?? []).map((l) => <li key={l.id}>{new Date(l.created_at).toLocaleString()} · {l.action}</li>)}</ul>
    </main>
  );
}
