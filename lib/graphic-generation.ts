export const GRAPHIC_FORMATS = [
  {
    key: "youtube_thumbnail",
    label: "YouTube Thumbnail",
    dimensions: "16:9 · 1280×720",
    sizePrompt:
      "Landscape 16:9 aspect ratio, 1280×720px. Designed for a high-click-through YouTube thumbnail with bold, phone-readable text and a clear focal point.",
  },
  {
    key: "instagram_square",
    label: "Instagram Square",
    dimensions: "1:1 · 1080×1080",
    sizePrompt:
      "Square 1:1 aspect ratio, 1080×1080px. Designed for an Instagram feed graphic with safe margins and an instantly readable focal point.",
  },
  {
    key: "instagram_portrait",
    label: "Instagram Portrait",
    dimensions: "4:5 · 1080×1350",
    sizePrompt:
      "Portrait 4:5 aspect ratio, 1080×1350px. Designed for an Instagram feed post or carousel cover that fills the mobile screen.",
  },
  {
    key: "instagram_story",
    label: "Story / Reel Cover",
    dimensions: "9:16 · 1080×1920",
    sizePrompt:
      "Vertical 9:16 aspect ratio, 1080×1920px. Designed for an Instagram Story or Reel cover, with critical text clear of the top and bottom interface safe zones.",
  },
] as const;

export type GraphicFormatKey = (typeof GRAPHIC_FORMATS)[number]["key"];

export function getGraphicFormat(key: string) {
  return GRAPHIC_FORMATS.find((format) => format.key === key) ?? GRAPHIC_FORMATS[0];
}

export function buildGraphicPrompt({
  description,
  formatKey,
  hasReference,
  facePhotoCount,
}: {
  description: string;
  formatKey: string;
  hasReference: boolean;
  facePhotoCount: number;
}) {
  const format = getGraphicFormat(formatKey);
  const style = hasReference
    ? "Match the aesthetic, mood, and quality level of the reference image provided above."
    : "Professional, polished, premium graphic design quality.";
  const person = facePhotoCount > 0
    ? `${facePhotoCount} face photos provided above must appear in the graphic. Preserve the person's real likeness so they are sharp, recognizable, and naturally integrated into the design.`
    : "";

  return `Generate a high-quality graphic with the following specifications:

SIZE: ${format.sizePrompt}

DESCRIPTION FROM USER:
${description.trim()}

STYLE: ${style}

${person ? `PERSON: ${person}\n\n` : ""}QUALITY RULES:
- Professional graphic design quality, not AI-generated looking
- Text must be 100% legible, with no warped, garbled, clipped, or repeated words
- Clean composition with clear visual hierarchy
- No watermarks, signatures, or artifacts
- Output should look like it was made by a professional designer`;
}
