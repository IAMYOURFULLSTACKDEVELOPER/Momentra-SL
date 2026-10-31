import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login"); // authorization is checked here, not just in navigation
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  return (
    <div>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img src="/momentra-logo.jpg" alt="Momentra Logo" className="h-8 w-8" />
            <span className="font-serif text-xl">MOMENTRA</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard/profile">Profile</Link>{isAdmin && <Link href="/admin">Admin</Link>}<SignOutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
