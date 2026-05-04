import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
// @ts-ignore - no types
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

let cachedRegular: ArrayBuffer | null = null;
let cachedBold: ArrayBuffer | null = null;

async function loadFontBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  return await res.arrayBuffer();
}

export interface HebrewDoc {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
}

export async function createHebrewDoc(): Promise<HebrewDoc> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  if (!cachedRegular) cachedRegular = await loadFontBytes("/fonts/NotoSansHebrew-Regular.ttf");
  if (!cachedBold) cachedBold = await loadFontBytes("/fonts/NotoSansHebrew-Bold.ttf");
  const regular = await pdf.embedFont(cachedRegular!, { subset: true });
  const bold = await pdf.embedFont(cachedBold!, { subset: true });
  return { pdf, regular, bold };
}

/**
 * Reorders a logical string to its visual order (right-to-left appearance for Hebrew).
 * Uses bidi-js to handle mixed Hebrew + numbers + Latin properly.
 */
export function shapeForVisual(text: string, baseRtl = true): string {
  if (!text) return "";
  const paragraphs = text.split("\n");
  const out: string[] = [];
  for (const p of paragraphs) {
    if (!p) { out.push(""); continue; }
    const embeddingLevels = bidi.getEmbeddingLevels(p, baseRtl ? "rtl" : "ltr");
    const flips = bidi.getReorderSegments(p, embeddingLevels);
    let chars = p.split("");
    for (const [start, end] of flips) {
      const slice = chars.slice(start, end + 1).reverse();
      chars.splice(start, end - start + 1, ...slice);
    }
    // For pure RTL paragraphs, also reverse the whole line if base is RTL and line has no embedding flips applied at top level
    out.push(chars.join(""));
  }
  return out.join("\n");
}

export interface DrawTextOpts {
  page: PDFPage;
  text: string;
  font: PDFFont;
  size: number;
  /** Right edge x coordinate (text grows to the left). */
  rightX: number;
  y: number;
  color?: { r: number; g: number; b: number };
  rtl?: boolean;
  maxWidth?: number;
}

export function drawRtlText(opts: DrawTextOpts) {
  const { page, font, size, rightX, y, rtl = true } = opts;
  const color = opts.color ?? { r: 0, g: 0, b: 0 };
  const visual = shapeForVisual(opts.text ?? "", rtl);
  if (!visual) return;
  const w = font.widthOfTextAtSize(visual, size);
  page.drawText(visual, {
    x: rightX - w,
    y,
    size,
    font,
    color: rgb(color.r, color.g, color.b),
  });
}

export function drawLtrText(opts: Omit<DrawTextOpts, "rightX"> & { x: number }) {
  page: opts.page.drawText(opts.text ?? "", {
    x: opts.x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: rgb(opts.color?.r ?? 0, opts.color?.g ?? 0, opts.color?.b ?? 0),
  });
}

export function drawCenteredRtlText(opts: { page: PDFPage; text: string; font: PDFFont; size: number; centerX: number; y: number; color?: { r: number; g: number; b: number }; }) {
  const visual = shapeForVisual(opts.text ?? "");
  const w = opts.font.widthOfTextAtSize(visual, opts.size);
  opts.page.drawText(visual, {
    x: opts.centerX - w / 2,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: rgb(opts.color?.r ?? 0, opts.color?.g ?? 0, opts.color?.b ?? 0),
  });
}

/** Wrap a string into lines that fit within maxWidth (after visual shaping). Returns lines in logical order (caller still passes through shapeForVisual when drawing). */
export function wrapTextLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? current + " " + w : w;
    const trialW = font.widthOfTextAtSize(shapeForVisual(trial), size);
    if (trialW <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function embedSignaturePng(pdf: PDFDocument, dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  try {
    if (dataUrl.startsWith("data:image/png")) {
      const base64 = dataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return await pdf.embedPng(bytes);
    } else if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
      const base64 = dataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return await pdf.embedJpg(bytes);
    }
    // URL fetch
    const res = await fetch(dataUrl);
    const buf = new Uint8Array(await res.arrayBuffer());
    try { return await pdf.embedPng(buf); } catch { return await pdf.embedJpg(buf); }
  } catch {
    return null;
  }
}

export async function embedLogo(pdf: PDFDocument, url: string | null | undefined) {
  if (!url) return null;
  return embedSignaturePng(pdf, url);
}
