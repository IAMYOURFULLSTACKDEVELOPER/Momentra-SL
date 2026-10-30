"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/browser";
import { authSchema, registerSchema } from "@/lib/validation";

type Mode = "login" | "register" | "forgot" | "reset";
const schemas = { login: authSchema, register: registerSchema, forgot: authSchema.pick({ email: true }), reset: authSchema.pick({ password: true }) } as const;
type Values = { email?: string; password?: string; displayName?: string };

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schemas[mode] as z.ZodTypeAny) });

  async function onSubmit(v: Values) {
    setError(null); setInfo(null);
    const supabase = createClient();
    const origin = window.location.origin;
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: v.email!, password: v.password! });
      if (error) return setError("Incorrect email or password.");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"); router.refresh();
    } else if (mode === "register") {
      const { data, error } = await supabase.auth.signUp({ email: v.email!, password: v.password!, options: { data: { display_name: v.displayName }, emailRedirectTo: `${origin}/auth/callback` } });
      if (error) return setError(error.message);
      if (data.session) { router.replace("/dashboard"); router.refresh(); } else setInfo("Check your email to confirm your account.");
    } else if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(v.email!, { redirectTo: `${origin}/auth/callback?next=/auth/reset` });
      if (error) return setError(error.message);
      setInfo("If that email has an account, a reset link is on its way.");
    } else {
      const { error } = await supabase.auth.updateUser({ password: v.password! });
      if (error) return setError(error.message);
      router.replace("/dashboard");
    }
  }
  const titles = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", reset: "Choose a new password" };
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-6 text-center font-serif text-xl">WeddingSnap</Link>
      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4" noValidate>
        <h1 className="font-serif text-2xl">{titles[mode]}</h1>
        {mode === "register" && <Field label="Your name" error={errors.displayName?.message}><input className="input" autoComplete="name" {...register("displayName")} /></Field>}
        {mode !== "reset" && <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register("email")} /></Field>}
        {mode !== "forgot" && <Field label={mode === "reset" ? "New password" : "Password"} error={errors.password?.message}><input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...register("password")} /></Field>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {info && <p role="status" className="text-sm text-green-700">{info}</p>}
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : "Continue"}</button>
        <div className="flex justify-between text-sm text-stone-600">
          {mode === "login" ? <><Link href="/auth/register">Create account</Link><Link href="/auth/forgot">Forgot password?</Link></> : <Link href="/auth/login">Back to sign in</Link>}
        </div>
      </form>
    </main>
  );
}
export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (<label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}{error && <span role="alert" className="mt-1 block text-xs text-red-700">{error}</span>}</label>);
}
