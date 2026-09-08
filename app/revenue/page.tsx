import { Suspense } from "react";
import FinancesWorkspace from "./finances-workspace";

// The Finances section is one page with four tabs (?tab=dashboard|sales|mrr|low).
// useSearchParams needs a Suspense boundary at build time.
export default function FinancesPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-zinc-600 animate-pulse">Loading finances…</p>}>
      <FinancesWorkspace />
    </Suspense>
  );
}
