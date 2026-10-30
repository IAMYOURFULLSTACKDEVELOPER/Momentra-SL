import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";
export default async function Profile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
  return (<><h1 className="mb-6 font-serif text-3xl">Profile</h1><ProfileForm email={user!.email ?? ""} name={p?.display_name ?? ""} /></>);
}
