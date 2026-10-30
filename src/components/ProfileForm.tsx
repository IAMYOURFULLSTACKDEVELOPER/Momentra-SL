"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
export function ProfileForm({ email, name }: { email: string; name: string }) {
  const [value, setValue] = useState(name); const [msg, setMsg] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setMsg("Please sign in again.");
    const { error } = await supabase.from("profiles").update({ display_name: value.trim().slice(0, 80) }).eq("id", user.id);
    setMsg(error ? error.message : "Saved.");
  }
  return (<form onSubmit={save} className="card max-w-md space-y-4"><p className="text-sm text-stone-600">{email}</p>
    <label className="block text-sm"><span className="mb-1 block font-medium">Display name</span><input className="input" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} /></label>
    <button className="btn-primary">Save</button>{msg && <p role="status" className="text-sm">{msg}</p>}</form>);
}
