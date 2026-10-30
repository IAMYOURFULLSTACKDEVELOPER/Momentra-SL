"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
export function SignOutButton() {
  const router = useRouter();
  return <button className="btn-ghost" onClick={async () => { await createClient().auth.signOut(); router.replace("/"); router.refresh(); }}>Sign out</button>;
}
