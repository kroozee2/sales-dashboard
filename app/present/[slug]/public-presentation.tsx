'use client';

import { useEffect, useState } from 'react';
import type { DeployedPresentationSnapshot } from '@/lib/presentations';
import { PresentationStage } from '@/components/presentation-stage';

type SharedPresentation = DeployedPresentationSnapshot & { slug: string };

export default function PublicPresentation({ slug }: { slug: string }) {
  const [presentation, setPresentation] = useState<SharedPresentation | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/presentations/deployed/${encodeURIComponent(slug)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.presentation) throw new Error(response.status === 404 ? 'This presentation has not been deployed.' : 'This presentation is temporarily unavailable.');
        return body.presentation as SharedPresentation;
      })
      .then((value) => { if (!controller.signal.aborted) setPresentation(value); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'This presentation is temporarily unavailable.'); });
    return () => controller.abort();
  }, [slug]);
  if (error) return <main className="grid min-h-screen place-items-center bg-[#04070d] p-6 text-white"><div role="alert" className="max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 text-center"><h1 className="text-xl font-bold">Presentation unavailable</h1><p className="mt-3 text-zinc-300">{error}</p></div></main>;
  if (!presentation) return <main className="grid min-h-screen place-items-center bg-[#04070d] text-zinc-300"><p role="status">Loading presentation…</p></main>;
  return <PresentationStage title={presentation.title} subtitle={presentation.subtitle} slides={presentation.slides} ariaLabel={`Presentation: ${presentation.title}`} />;
}
