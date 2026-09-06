import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import { buildGraphicPrompt } from "@/lib/graphic-generation";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 4_000;

function emit(controller: ReadableStreamDefaultController, data: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(data)}\n`));
}

async function imagePart(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name || "Upload"} must be an image.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name || "Upload"} is too large. Use an image under 8MB.`);
  }
  return {
    inlineData: {
      mimeType: file.type || "image/jpeg",
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    },
  };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const description = String(formData.get("description") ?? "").trim();
  const formatKey = String(formData.get("format") ?? "youtube_thumbnail");
  const reference = formData.get("reference");
  const requestedPhotoCount = Number.parseInt(String(formData.get("photoCount") ?? "0"), 10);
  const photoCount = Number.isFinite(requestedPhotoCount)
    ? Math.max(0, Math.min(requestedPhotoCount, 3))
    : 0;

  if (!description) {
    return Response.json({ error: "Describe the graphic you want." }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json({ error: "Keep the description under 4,000 characters." }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        emit(controller, { event: "progress", message: "Building your graphic..." });

        const parts: Array<{
          inlineData?: { mimeType: string; data: string };
          text?: string;
        }> = [];

        if (reference instanceof File && reference.size > 0) {
          parts.push(await imagePart(reference));
          parts.push({
            text: "The image above is a STYLE REFERENCE. Study its color palette, typography style, layout composition, mood, and overall graphic quality. Model the output after this style. Do not copy its text, names, or specific content.",
          });
        }

        const facePhotos: File[] = [];
        for (let index = 0; index < photoCount; index += 1) {
          const candidate = formData.get(`photo_${index}`);
          if (candidate instanceof File && candidate.size > 0) {
            facePhotos.push(candidate);
            parts.push(await imagePart(candidate));
          }
        }

        parts.push({
          text: buildGraphicPrompt({
            description,
            formatKey,
            hasReference: reference instanceof File && reference.size > 0,
            facePhotoCount: facePhotos.length,
          }),
        });

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-pro-image",
          contents: [{ role: "user", parts }],
          config: { responseModalities: ["IMAGE", "TEXT"] },
        });

        const responseParts = response.candidates?.[0]?.content?.parts ?? [];
        const image = responseParts.find(
          (part) => part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data,
        )?.inlineData;

        if (!image?.data) {
          throw new Error("The image model returned no image. Try a more specific description.");
        }

        emit(controller, {
          event: "image",
          dataUrl: `data:${image.mimeType || "image/png"};base64,${image.data}`,
        });
        emit(controller, { event: "progress", message: "Done." });
        emit(controller, { event: "done" });
      } catch (error) {
        emit(controller, {
          event: "error",
          message: error instanceof Error ? error.message : "Generation failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
