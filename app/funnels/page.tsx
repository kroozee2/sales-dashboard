import { FunnelsBoard } from "@/components/funnels";

// Marketing: every funnel and page we send people to, in one sheet.
export default function FunnelsPage() {
  return (
    <div className="space-y-4">
      <header>
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-blue-300/70">Marketing</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Funnels</h1>
      </header>
      <FunnelsBoard />
    </div>
  );
}
