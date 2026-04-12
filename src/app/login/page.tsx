"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogoFull, LogoIcon } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); return; }
      router.push("/home");
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
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-indigo-600 p-12 text-white">
        <LogoIcon size={40} />

        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Your AI-powered inbox<br />is waiting for you
          </h2>
          <p className="mt-4 text-indigo-200 leading-relaxed max-w-md">
            Manage WhatsApp, Instagram, Messenger, SMS, and Email conversations
            with AI that knows your business. Free forever.
          </p>

          {/* Mini mockup */}
          <div className="mt-8 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-4">
            <div className="space-y-2.5">
              {[
                { name: "Sarah M.", msg: "Thanks for the quick help!", platform: "whatsapp", time: "2m" },
                { name: "Ahmed K.", msg: "When does my order arrive?", platform: "instagram", time: "8m" },
                { name: "Lisa T.", msg: "Can I get a refund?", platform: "messenger", time: "1h" },
              ].map((c, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${i === 0 ? "bg-white/15" : "bg-white/5"}`}>
                  <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                    {c.name.split(" ").map(w => w[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold">{c.name}</span>
                      <span className="text-[10px] text-indigo-300">{c.time}</span>
                    </div>
                    <div className="text-[11px] text-indigo-200 truncate">{c.msg}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-indigo-300">
          <span>5 channels</span>
          <span>AI auto-reply</span>
          <span>Free forever</span>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoFull />
          </div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your InboxWeave account</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" placeholder="you@company.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" placeholder="Enter your password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <button className="btn w-full py-3" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-indigo-600 hover:underline">
                Sign up free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
