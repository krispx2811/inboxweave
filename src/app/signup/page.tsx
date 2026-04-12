"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogoFull, LogoIcon } from "@/components/Logo";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
      if (signUpErr) { setError(signUpErr.message); return; }
      if (!data.user) { setError("Check your email to confirm your account."); return; }
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, userId: data.user.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Failed to create org");
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left — product showcase */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-600 to-purple-700 p-12 text-white">
        <LogoIcon size={40} />

        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Start automating your<br />customer conversations
          </h2>
          <p className="mt-4 text-indigo-200 leading-relaxed max-w-md">
            Set up in under 5 minutes. Connect your channels, upload your knowledge base,
            and let AI handle the rest.
          </p>

          {/* Feature highlights */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { label: "AI Auto-Reply", desc: "GPT-4o answers instantly" },
              { label: "5 Channels", desc: "WA, IG, FB, SMS, Email" },
              { label: "Knowledge Base", desc: "Upload docs for RAG" },
              { label: "Team Inbox", desc: "Assign, tag, resolve" },
              { label: "Analytics", desc: "Response times + CSAT" },
              { label: "100% Free", desc: "No subscriptions ever" },
            ].map(({ label, desc }) => (
              <div key={label} className="rounded-lg bg-white/10 px-3 py-2.5 backdrop-blur-sm border border-white/10">
                <div className="text-xs font-bold">{label}</div>
                <div className="text-[10px] text-indigo-200">{desc}</div>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div className="mt-8 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["SM", "AK", "LT", "JD"].map((initials, i) => (
                <div key={i} className="h-8 w-8 rounded-full bg-white/20 border-2 border-indigo-600 flex items-center justify-center text-[10px] font-bold">
                  {initials}
                </div>
              ))}
            </div>
            <p className="text-xs text-indigo-200">Businesses are already using InboxWeave</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-indigo-300">
          <span>No credit card</span>
          <span>Instant setup</span>
          <span>Cancel anytime</span>
        </div>
      </div>

      {/* Right — signup form */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoFull />
          </div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Create your free account</h1>
            <p className="mt-1 text-sm text-slate-500">100% free, forever. No credit card needed.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="orgName">Organization name</label>
              <input id="orgName" className="input" placeholder="e.g. My Company" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" placeholder="you@company.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" placeholder="Min 8 characters" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <button className="btn w-full py-3" type="submit" disabled={busy}>
              {busy ? "Creating account..." : "Get started free"}
            </button>

            <p className="text-[10px] text-slate-400 leading-relaxed">
              By signing up, you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
