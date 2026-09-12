'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeployedPresentationSlide } from '@/lib/presentations';

function SlideCopy({ copy }: { copy: string }) {
  return (
    <div className="space-y-3 text-center text-base leading-relaxed text-zinc-200 sm:text-xl">
      {copy.split(/\n{2,}/).map((block, index) => {
        const clean = block.replace(/^#{1,3}\s+/gm, '').replace(/\*\*/g, '').trim();
        if (!clean) return null;
        if (/^(?:[-*] |\d+\. )/m.test(clean)) {
          return <div key={index} className="mx-auto max-w-3xl whitespace-pre-wrap break-words text-left [overflow-wrap:anywhere]">{clean}</div>;
        }
        return <p key={index} className="mx-auto max-w-3xl whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{clean}</p>;
      })}
    </div>
  );
}

export function PresentationStage({
  title,
  subtitle,
  slides,
  initialIndex = 0,
  onClose,
  ariaLabel,
}: {
  title: string;
  subtitle: string;
  slides: DeployedPresentationSlide[];
  initialIndex?: number;
  onClose?: () => void;
  ariaLabel: string;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(slides.length - 1, 0)));
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const previous = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);
  const next = useCallback(() => setIndex((value) => Math.min(slides.length - 1, value + 1)), [slides.length]);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); next(); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      else if (event.key === 'Home') { event.preventDefault(); setIndex(0); }
      else if (event.key === 'End') { event.preventDefault(); setIndex(slides.length - 1); }
      else if (event.key === 'Escape' && closeRef.current) { event.preventDefault(); closeRef.current(); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [next, previous, slides.length]);

  const slide = slides[index];
  if (!slide) return <div role="alert">This presentation has no audience slides.</div>;
  const Root = onClose ? 'div' : 'main';
  return (
    <Root
      ref={frameRef}
      role={onClose ? 'dialog' : undefined}
      aria-modal={onClose ? true : undefined}
      aria-label={ariaLabel}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col overflow-hidden bg-[#04070d] text-white"
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="hidden truncate text-xs text-zinc-400 sm:block">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button type="button" onClick={() => void frameRef.current?.requestFullscreen?.()} className="min-h-11 rounded-xl border border-white/20 px-3 text-sm">Fullscreen</button>
          )}
          {onClose && <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl border border-white/20 px-3 text-sm" aria-label="Exit presentation">Exit</button>}
        </div>
      </header>
      <section className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-8 sm:px-10" aria-live="polite">
        <div className="w-full max-w-5xl">
          {slide.optional && <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Optional slide</p>}
          <h1 className="mb-8 break-words text-center text-3xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-5xl">{slide.title}</h1>
          <SlideCopy copy={slide.on_screen_copy} />
        </div>
      </section>
      <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <button type="button" onClick={previous} disabled={index === 0} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm disabled:opacity-35">Previous</button>
        <span className="text-sm tabular-nums text-zinc-300" aria-label={`Slide ${index + 1} of ${slides.length}`}>{index + 1} / {slides.length}</span>
        <button type="button" onClick={next} disabled={index === slides.length - 1} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm disabled:opacity-35">Next</button>
      </footer>
    </Root>
  );
}
