"use client";

import { useEffect, useRef, useState } from "react";
import { GRAPHIC_FORMATS } from "@/lib/graphic-generation";

type Graphic = {
  id: string;
  title: string | null;
  image_url: string;
  spec: string | null;
  format: string | null;
  created_at: string;
};

type Upload = { file: File; preview: string };

type StreamEvent =
  | { event: "progress"; message: string }
  | { event: "image"; dataUrl: string }
  | { event: "error"; message: string }
  | { event: "done" };

function useVoice(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const supported =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = (
      window as unknown as {
        webkitSpeechRecognition?: new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (event: {
            resultIndex: number;
            results: {
              [index: number]: {
                isFinal: boolean;
                0: { transcript: string };
              };
              length: number;
            };
          }) => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        };
      }
    ).webkitSpeechRecognition;

    if (!SpeechRecognition) return;
    const instance = new SpeechRecognition();
    instance.continuous = true;
    instance.interimResults = false;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      let text = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) text += `${event.results[index][0].transcript} `;
      }
      if (text) onText(text.trim());
    };
    instance.onend = () => setListening(false);
    instance.start();
    recognition.current = instance;
    setListening(true);
  }

  return { listening, supported, toggle };
}

function UploadBox({
  label,
  hint,
  upload,
  compact = false,
  onChange,
}: {
  label: string;
  hint?: string;
  upload: Upload | null;
  compact?: boolean;
  onChange: (upload: Upload | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    if (upload) URL.revokeObjectURL(upload.preview);
    onChange({ file, preview: URL.createObjectURL(file) });
  }

  function clear(event: React.MouseEvent) {
    event.stopPropagation();
    if (upload) URL.revokeObjectURL(upload.preview);
    onChange(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-zinc-300">{label}</p>
          {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{hint}</p>}
        </div>
        {upload && (
          <button type="button" onClick={clear} className="text-[11px] text-zinc-500 hover:text-rose-400">
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`w-full overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/60 text-left transition-colors hover:border-zinc-500 ${compact ? "min-h-28" : "min-h-36"}`}
      >
        {upload ? (
          <div className="flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={upload.preview} alt="Upload preview" className={`${compact ? "h-16 w-16" : "h-24 w-24"} rounded-lg bg-black object-cover`} />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-zinc-200">{upload.file.name}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Click to change</p>
            </div>
          </div>
        ) : (
          <div className={`${compact ? "py-5" : "py-8"} text-center`}>
            <div className="text-2xl">📷</div>
            <p className="mt-1 text-xs font-semibold text-zinc-400">Click to upload</p>
            <p className="mt-0.5 text-[10px] text-zinc-600">JPG, PNG, or WEBP</p>
          </div>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => choose(event.target.files?.[0])}
      />
    </div>
  );
}

async function downloadImage(url: string, filename: string) {
  try {
    const blob = await fetch(url).then((response) => response.blob());
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export default function GraphicsStudio() {
  const [format, setFormat] = useState("youtube_thumbnail");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState<Upload | null>(null);
  const [faces, setFaces] = useState<(Upload | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<Graphic[]>([]);
  const voice = useVoice((text) =>
    setDescription((current) => `${current}${current.trim() ? " " : ""}${text}`),
  );

  useEffect(() => {
    void fetch("/api/content/graphics")
      .then((response) => response.json())
      .then((data) => setLibrary(data.graphics ?? []))
      .catch(() => undefined);
  }, []);

  const selectedFormat =
    GRAPHIC_FORMATS.find((candidate) => candidate.key === format) ?? GRAPHIC_FORMATS[0];

  async function autoSave(dataUrl: string) {
    setSaving(true);
    try {
      const blob = await fetch(dataUrl).then((response) => response.blob());
      const filename = `${format}-${Date.now()}.${blob.type.includes("jpeg") ? "jpg" : "png"}`;
      const uploadForm = new FormData();
      uploadForm.append("file", new File([blob], filename, { type: blob.type || "image/png" }));
      const uploadResponse = await fetch("/api/content/upload", {
        method: "POST",
        body: uploadForm,
      });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok || !uploaded.url) {
        throw new Error(uploaded.error ?? "Could not host the generated image.");
      }

      const title = description.trim().slice(0, 80) || selectedFormat.label;
      const saveResponse = await fetch("/api/content/graphics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          image_url: uploaded.url,
          spec: description.trim(),
          format,
        }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.graphic) {
        throw new Error(saved.error ?? "Could not save the graphic to the library.");
      }

      setResultUrl(uploaded.url);
      setResultSaved(true);
      setLibrary((current) => [saved.graphic as Graphic, ...current]);
      setProgress((current) => [...current, "Saved to your SalesOS graphic library."]);
    } catch (saveError) {
      setError(
        `Your graphic was created, but automatic saving failed: ${
          saveError instanceof Error ? saveError.message : "Unknown error"
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.event === "progress") {
      setProgress((current) => [...current, event.message]);
    } else if (event.event === "image") {
      setResultUrl(event.dataUrl);
    } else if (event.event === "error") {
      setError(event.message);
    }
  }

  async function generate() {
    if (!description.trim()) {
      setError("Describe what you want the graphic to say and look like.");
      return;
    }

    setLoading(true);
    setProgress([]);
    setResultUrl(null);
    setResultSaved(false);
    setError(null);

    const form = new FormData();
    form.append("description", description.trim());
    form.append("format", format);
    if (reference) form.append("reference", reference.file);
    const validFaces = faces.filter((face): face is Upload => Boolean(face));
    form.append("photoCount", String(validFaces.length));
    validFaces.forEach((face, index) => form.append(`photo_${index}`, face.file));

    let generatedDataUrl: string | null = null;
    let streamError: string | null = null;
    try {
      const response = await fetch("/api/content/graphic", { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Graphic generation failed.");
      }
      if (!response.body) throw new Error("The graphic generator returned no stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          handleStreamEvent(event);
          if (event.event === "image") generatedDataUrl = event.dataUrl;
          if (event.event === "error") streamError = event.message;
        }
      }
      if (buffer.trim()) {
        const event = JSON.parse(buffer) as StreamEvent;
        handleStreamEvent(event);
        if (event.event === "image") generatedDataUrl = event.dataUrl;
        if (event.event === "error") streamError = event.message;
      }
      if (!generatedDataUrl) {
        throw new Error(streamError ?? "The image model returned no image. Try a more specific description.");
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Graphic generation failed.");
    } finally {
      setLoading(false);
    }

    if (generatedDataUrl) await autoSave(generatedDataUrl);
  }

  function setFace(index: number, upload: Upload | null) {
    setFaces((current) => current.map((face, faceIndex) => (faceIndex === index ? upload : face)));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-blue-500/5 p-5">
        <p className="text-base font-bold text-white">🎨 Social Graphics Creator</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-400">
          The same one-click workflow as your Skool Monetization app, now built for YouTube and Instagram. Choose a size, add a style reference and your face if you want, then describe the finished graphic.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">1. Choose the format</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GRAPHIC_FORMATS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFormat(option.key)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                format === option.key
                  ? "border-blue-500/50 bg-blue-500/15"
                  : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"
              }`}
            >
              <p className={`text-sm font-bold ${format === option.key ? "text-blue-200" : "text-zinc-200"}`}>
                {option.label}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{option.dimensions}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">2. Reference and photos</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <UploadBox
            label="Reference graphic"
            hint="The AI models its visual style and layout, not its words or content."
            upload={reference}
            onChange={setReference}
          />
          <div>
            <div className="mb-1.5">
              <p className="text-xs font-semibold text-zinc-300">Face or person photos</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Optional, up to three angles for a more accurate likeness.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {faces.map((face, index) => (
                <UploadBox
                  key={index}
                  label={index === 0 ? "Main" : `Photo ${index + 1}`}
                  upload={face}
                  compact
                  onChange={(upload) => setFace(index, upload)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">3. Describe the finished graphic</p>
            <p className="mt-1 text-[11px] text-zinc-500">Include the exact words, colors, layout, mood, and where your face should appear.</p>
          </div>
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                voice.listening ? "bg-rose-600 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {voice.listening ? "⏹ Stop" : "🎙️ Speak it"}
            </button>
          )}
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          placeholder={'Example: A high-energy YouTube thumbnail. Exact text: "AI CLEARED MY TASK LIST". My face on the right looking surprised. Dark navy background, electric blue glow, white bold text on the left, a small Calendar icon behind me.'}
          className="mt-3 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm leading-relaxed text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
        />
        {error && <p className="mt-2 text-xs leading-relaxed text-rose-400">{error}</p>}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading || saving || !description.trim()}
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
        >
          {loading ? "🎨 Generating..." : saving ? "💾 Saving to SalesOS..." : `✨ Generate ${selectedFormat.label}`}
        </button>

        {(progress.length > 0 || loading) && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
            {progress.map((message, index) => (
              <div key={`${message}-${index}`} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                {message}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" /> Working...
              </div>
            )}
          </div>
        )}
      </section>

      {resultUrl && (
        <section className="overflow-hidden rounded-2xl border border-blue-500/30 bg-zinc-900">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">Your graphic</p>
              <p className="text-[11px] text-zinc-500">
                {saving ? "Saving automatically..." : resultSaved ? "Saved to the SalesOS graphic library." : "Created. Download is ready."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void downloadImage(resultUrl, `${format}.png`)}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500"
            >
              ⬇ Download
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Generated graphic" className="block w-full bg-black object-contain" />
        </section>
      )}

      {library.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Saved graphics</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {library.map((graphic) => (
              <article key={graphic.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={graphic.image_url} alt={graphic.title ?? "Saved graphic"} className="aspect-video w-full bg-black object-contain" />
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-zinc-200">{graphic.title || "Graphic"}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-zinc-600">{graphic.format ? GRAPHIC_FORMATS.find((item) => item.key === graphic.format)?.label ?? graphic.format : "Graphic"}</span>
                    <button
                      type="button"
                      onClick={() => void downloadImage(graphic.image_url, `${graphic.format || "graphic"}.png`)}
                      className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
