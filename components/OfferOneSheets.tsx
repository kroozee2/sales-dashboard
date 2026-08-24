import { OFFER_ONE_SHEETS } from "@/lib/offer-page-assets";

const CARD_STYLE = [
  "from-violet-600/25 via-violet-950/40 to-zinc-950 border-violet-500/30",
  "from-cyan-600/20 via-cyan-950/40 to-zinc-950 border-cyan-500/30",
  "from-emerald-600/20 via-emerald-950/40 to-zinc-950 border-emerald-500/30",
];

export default function OfferOneSheets() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 md:p-8">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Offer One-Sheets</div>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">All three offers. One place.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
          Open the exact offer page you need without searching through projects or links.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {OFFER_ONE_SHEETS.map((offer, index) => (
          <article
            key={offer.id}
            className={`flex min-h-72 flex-col rounded-3xl border bg-gradient-to-br p-6 ${CARD_STYLE[index]}`}
          >
            <div className="text-3xl" aria-hidden="true">{index === 0 ? "🧠" : index === 1 ? "🚀" : "🏫"}</div>
            <h3 className="mt-5 text-2xl font-black leading-tight text-white">{offer.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{offer.purpose}</p>
            <a
              href={offer.url}
              target="_blank"
              rel="noreferrer"
              className="mt-auto flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-violet-200"
            >
              Open one-sheet <span aria-hidden="true">↗</span>
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
