"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// What the Sales OS actually is — shown beside the form so a new teammate
// signing in for the first time knows what they've been handed.
const CAPABILITIES = [
  { emoji: "🎯", title: "Leads & Messages", body: "Every lead, and every GoHighLevel conversation, in one inbox." },
  { emoji: "📞", title: "Calls", body: "Sales calls sync from the calendar with prep, intel and follow-up." },
  { emoji: "✍️", title: "Content", body: "Plan the calendar, then see what actually posted and how it did." },
  { emoji: "💰", title: "Revenue & Goals", body: "Live cash collected, pipeline, and the targets they roll up to." },
  { emoji: "⚡", title: "Execution", body: "Tasks, projects, and the daily winning formula." },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [stage, setStage] = useState<"signin" | "setPassword">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [who, setWho] = useState<string>("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "Incorrect password"); setPassword(""); return; }
      if (body.mustChangePassword) {
        // First time in — make them replace the temporary password before going further.
        setWho(body.member?.name ?? "");
        setStage("setPassword");
        return;
      }
      router.replace(next); router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally { setBusy(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) { setError("Those two passwords don't match."); return; }
    if (newPassword.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "Couldn't save that password."); return; }
      router.replace(next); router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally { setBusy(false); }
  }

  const input = "w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-3 text-[15px] text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors";

  return (
    <main className="min-h-[100dvh] bg-zinc-950 text-white grid lg:grid-cols-[1.1fr_1fr]">
      {/* Left: what this is */}
      <div className="hidden lg:flex flex-col justify-center px-12 xl:px-20 border-r border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 grid place-items-center shadow-lg">
            <span className="text-base font-extrabold">7F</span>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">Sales <span className="text-blue-400">OS</span></p>
            <p className="text-[11px] tracking-[0.25em] text-zinc-600 uppercase">7-Figure CEO</p>
          </div>
        </div>
        <h1 className="text-3xl xl:text-4xl font-bold tracking-tight leading-tight">
          The command center for the whole business.
        </h1>
        <p className="text-zinc-400 mt-3 leading-relaxed max-w-md">
          Leads, calls, content, revenue and execution — one place, live, so nothing gets
          worked twice and nothing slips.
        </p>
        <div className="mt-8 space-y-3.5 max-w-md">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="flex gap-3">
              <span className="text-lg leading-none mt-0.5">{c.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-zinc-100">{c.title}</p>
                <p className="text-[13px] text-zinc-500 leading-snug">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: the form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* compact brand for phones */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 grid place-items-center">
              <span className="text-sm font-extrabold">7F</span>
            </div>
            <div>
              <p className="font-bold tracking-tight">Sales <span className="text-blue-400">OS</span></p>
              <p className="text-[10px] tracking-[0.25em] text-zinc-600 uppercase">7-Figure CEO</p>
            </div>
          </div>

          {stage === "signin" ? (
            <form onSubmit={signIn} className="space-y-3.5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
                <p className="text-zinc-500 text-sm mt-1">Use the email and password you were given.</p>
              </div>
              <div>
                <label htmlFor="email" className="block text-xs text-zinc-500 mb-1.5">Email</label>
                <input id="email" type="email" autoComplete="username" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs text-zinc-500 mb-1.5">Password</label>
                <input id="password" type="password" autoComplete="current-password" autoFocus value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={input} />
              </div>
              {error && <p className="text-rose-400 text-sm" role="alert">{error}</p>}
              <button type="submit" disabled={busy || !password}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold text-[15px] hover:brightness-110 disabled:opacity-40 transition-all">
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <p className="text-zinc-600 text-xs text-center pt-1">
                First time here? Sign in with your temporary password and you&apos;ll set your own next.
              </p>
            </form>
          ) : (
            <form onSubmit={savePassword} className="space-y-3.5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Choose your password</h2>
                <p className="text-zinc-500 text-sm mt-1">
                  {who ? `Welcome, ${who.split(" ")[0]}. ` : ""}Replace the temporary one with something only you know.
                </p>
              </div>
              <div>
                <label htmlFor="new" className="block text-xs text-zinc-500 mb-1.5">New password</label>
                <input id="new" type="password" autoComplete="new-password" autoFocus value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)} placeholder="at least 8 characters" className={input} />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-xs text-zinc-500 mb-1.5">Confirm it</label>
                <input id="confirm" type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} placeholder="type it again" className={input} />
              </div>
              {error && <p className="text-rose-400 text-sm" role="alert">{error}</p>}
              <button type="submit" disabled={busy || !newPassword || !confirm}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold text-[15px] hover:brightness-110 disabled:opacity-40 transition-all">
                {busy ? "Saving…" : "Save and continue"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  );
}
