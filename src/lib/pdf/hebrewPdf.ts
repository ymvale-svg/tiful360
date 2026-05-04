import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
// @ts-ignore - no types
import bidiFactory from "bidi-js";
// Bundled via Vite — guarantees we always get the real TTF bytes (not an
// HTML fallback served by the dev server when a /public file is missing).
import notoSansHebrewRegularUrl from "@/assets/fonts/NotoSansHebrew-Regular.ttf?url";
import notoSansHebrewBoldUrl from "@/assets/fonts/NotoSansHebrew-Bold.ttf?url";

const bidi = bidiFactory();

// Cached as Uint8Array. We hand a *fresh copy* to pdf-lib on every embed
// because pdf-lib/fontkit may detach or mutate the underlying ArrayBuffer,
// which would corrupt subsequent PDFs that share the same cached bytes.
let cachedRegular: Uint8Array | null = null;
let cachedBold: Uint8Array | null = null;

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url} (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Sanity-check the magic header so we fail loudly if the dev server
  // returned an HTML fallback instead of the actual font.
  const head = buf.subarray(0, 4);
  const isTTF = head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00;
  const isOTF = head[0] === 0x4f && head[1] === 0x54 && head[2] === 0x54 && head[3] === 0x4f; // 'OTTO'
  if (!isTTF && !isOTF) {
    throw new Error(`Font at ${url} is not a valid TTF/OTF (got header ${Array.from(head).map((b) => b.toString(16)).join(" ")})`);
  }
  return buf;
}

export interface HebrewDoc {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
}

async function embedHebrewFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  if (!cachedRegular) cachedRegular = await loadFontBytes(notoSansHebrewRegularUrl);
  if (!cachedBold) cachedBold = await loadFontBytes(notoSansHebrewBoldUrl);
  // Pass a fresh copy each time — pdf-lib/fontkit may mutate or detach
  // the buffer it receives, which would silently corrupt the next PDF
  // built from the same cached bytes.
  const regular = await pdf.embedFont(new Uint8Array(cachedRegular), { subset: true });
  const bold = await pdf.embedFont(new Uint8Array(cachedBold), { subset: true });
  return { regular, bold };
}

export async function createHebrewDoc(): Promise<HebrewDoc> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedHebrewFonts(pdf);
  return { pdf, regular, bold };
}

let templateBytesCache: Record<string, ArrayBuffer> = {};

async function loadTemplateBytes(url: string): Promise<ArrayBuffer> {
  if (!templateBytesCache[url]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load template: ${url}`);
    templateBytesCache[url] = await res.arrayBuffer();
  }
  // Return a copy — pdf-lib mutates the buffer when loading.
  return templateBytesCache[url].slice(0);
}

export interface TemplateDoc {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  /** Append a fresh copy of the template's first page to the doc and return it. */
  appendTemplatePage: () => Promise<PDFPage>;
}

/**
 * Load a PDF template into a new pdf-lib doc. The first page of the template
 * becomes page 1 of the output. Use `appendTemplatePage()` to add more pages
 * (each one is a fresh clone of the template's first page).
 */
export async function loadTemplateDoc(templateUrl: string): Promise<TemplateDoc> {
  const bytes = await loadTemplateBytes(templateUrl);
  const pdf = await PDFDocument.load(bytes);
  const { regular, bold } = await embedHebrewFonts(pdf);
  const firstPage = pdf.getPage(0);
  const { width, height } = firstPage.getSize();

  const appendTemplatePage = async () => {
    const sourceBytes = await loadTemplateBytes(templateUrl);
    const sourceDoc = await PDFDocument.load(sourceBytes);
    const [copied] = await pdf.copyPages(sourceDoc, [0]);
    pdf.addPage(copied);
    return copied;
  };

  return { pdf, regular, bold, width, height, appendTemplatePage };
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
  opts.page.drawText(opts.text ?? "", {
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
