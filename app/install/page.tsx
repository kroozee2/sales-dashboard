"use client";

import { useEffect, useState } from "react";

const APP_URL = "https://7fc-sales-dashboard.vercel.app/home";
const QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(APP_URL)}`;

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }>; }

export default function InstallPage() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-512-rounded.png" alt="Sales OS icon" className="w-16 h-16 rounded-2xl shadow-lg flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Install Sales OS</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Put <span className="text-blue-400 font-semibold">Sales OS</span> on your home screen — full-screen, one tap from your phone, no app store needed.</p>
        </div>
      </div>

      {installed ? (
        <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-2xl p-5 text-emerald-300 text-sm">✓ You&apos;re running the installed app. You&apos;re all set.</div>
      ) : (
        <>
          {deferred && (
            <button onClick={install} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">
              📲 Install now (one tap)
            </button>
          )}

          <div className="grid md:grid-cols-2 gap-4 items-start">
            {/* QR */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-white font-semibold text-sm mb-1">🔲 Scan to open on your phone</p>
              <p className="text-zinc-500 text-xs mb-4">Point your phone camera at this code, then follow the steps to install.</p>
              <div className="bg-white rounded-xl p-4 grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={QR_SRC} alt="QR code to open Sales OS" className="w-full max-w-[260px]" />
              </div>
              <p className="text-zinc-600 text-[11px] text-center mt-3 break-all">{APP_URL}</p>
            </div>

            {/* Steps */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
              <p className="text-white font-semibold text-sm">📲 How to install</p>
              <div>
                <div className="text-sm font-semibold text-blue-300 mb-1.5"> iPhone / iPad</div>
                <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Open the link in <span className="text-zinc-200 font-medium">Safari</span></li>
                  <li>Tap the <span className="text-zinc-200 font-medium">Share</span> button (square with an up arrow)</li>
                  <li>Scroll down and tap <span className="text-zinc-200 font-medium">Add to Home Screen</span></li>
                  <li>Tap <span className="text-zinc-200 font-medium">Add</span> — the 7F icon lands on your home screen</li>
                </ol>
              </div>
              <div>
                <div className="text-sm font-semibold text-blue-300 mb-1.5">🤖 Android</div>
                <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Open the link in <span className="text-zinc-200 font-medium">Chrome</span></li>
                  <li>Tap the <span className="text-zinc-200 font-medium">three-dot menu</span></li>
                  <li>Tap <span className="text-zinc-200 font-medium">Install app</span> (or &ldquo;Add to Home Screen&rdquo;)</li>
                  <li>Tap <span className="text-zinc-200 font-medium">Install</span> to confirm</li>
                </ol>
              </div>
              <div className="rounded-xl bg-zinc-800/60 border border-zinc-700 p-3 text-xs text-zinc-400 leading-relaxed">
                Once installed, Sales OS opens full-screen with no browser bar — leads, calls, scripts, revenue, and your AI team, one tap away.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
