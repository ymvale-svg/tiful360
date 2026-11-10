import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import templateUrl from "@/assets/forms/tax101/form-0101-130.pdf?url";
import { embedHebrewFonts, shapeForVisual } from "@/lib/pdf/hebrewPdf";
import {
  DECLARATION,
  TAX101_FIELDS,
  TAX_YEAR_CELLS,
  YEAR_CHANGE_ROW_PITCH,
  YEAR_CHANGE_ROW_TOP,
  YEAR_CHANGE_SIGNATURE_X,
  type Box,
  type Tax101Field,
} from "@/lib/tax101/layout";
import { cellChars, dateToCells, formatDmy, splitIsoDate, splitPhone } from "@/lib/tax101/format";
import { getPath } from "@/lib/tax101/paths";
import type { Tax101FormData } from "@/lib/tax101/types";

export interface BuildTax101PdfInput {
  data: Tax101FormData;
  taxYear: number;
  /** PNG data URL from the signature pad. Omit for an unsigned preview. */
  signatureDataUrl?: string | null;
  signedAt?: Date;
}

const INK = rgb(0.05, 0.13, 0.5);
const MIN_SIZE = 5;

let templateCache: ArrayBuffer | null = null;
async function loadTemplate(): Promise<ArrayBuffer> {
  if (!templateCache) {
    const res = await fetch(templateUrl);
    if (!res.ok) throw new Error(`Form 101 template failed to load (${res.status})`);
    templateCache = await res.arrayBuffer();
  }
  return templateCache.slice(0);
}

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/** Row of a repeating table that has nothing typed in it is not printed at all. */
function isRowEmpty(row: unknown, keys: string[]): boolean {
  if (!row || typeof row !== "object") return true;
  return keys.every((k) => {
    const v = (row as Record<string, unknown>)[k];
    return v === undefined || v === null || v === "";
  });
}

const ROW_KEYS: Record<string, string[]> = {
  dependents: ["full_name", "id_number", "birth_date"],
  year_changes: ["change_date", "details", "notification_date"],
  "tax_coordination.additional_employers": ["employer_name", "employer_address", "tax_file_number", "income_type", "monthly_gross", "tax_withheld"],
};

function rowOf(path: string): { table: string; index: number } | null {
  for (const table of Object.keys(ROW_KEYS)) {
    const m = new RegExp(`^${table.replace(".", "\\.")}\\.(\\d+)\\.`).exec(path);
    if (m) return { table, index: Number(m[1]) };
  }
  return null;
}

/** Converts a top-left measured baseline to pdf-lib's bottom-left y. */
class Writer {
  constructor(
    private page: PDFPage,
    private font: PDFFont,
  ) {}

  private get height() {
    return this.page.getSize().height;
  }

  /** Writes `text` inside [x, x+w], shrinking it to fit. */
  text(text: string, x: number, w: number, top: number, h: number, opts: { size?: number; align?: "left" | "right" | "center" } = {}) {
    if (!text) return;
    const shaped = hasHebrew(text) ? shapeForVisual(text) : text;
    let size = opts.size ?? Math.min(9.5, h - 2);
    let width = this.font.widthOfTextAtSize(shaped, size);
    while (width > w - 2 && size > MIN_SIZE) {
      size -= 0.5;
      width = this.font.widthOfTextAtSize(shaped, size);
    }
    const align = opts.align ?? (hasHebrew(text) ? "right" : "left");
    const tx = align === "right" ? x + w - width - 1.5 : align === "center" ? x + (w - width) / 2 : x + 1.5;
    const baseline = top + h / 2 + size * 0.36;
    this.page.drawText(shaped, { x: tx, y: this.height - baseline, size, font: this.font, color: INK });
  }

  cells(chars: string[], x: number, pitch: number, top: number, h: number) {
    const size = Math.min(10, h - 3);
    chars.forEach((ch, i) => {
      const cw = this.font.widthOfTextAtSize(ch, size);
      const cx = x + pitch * i + (pitch - cw) / 2;
      const baseline = top + h / 2 + size * 0.36;
      this.page.drawText(ch, { x: cx, y: this.height - baseline, size, font: this.font, color: INK });
    });
  }

  check(box: Box) {
    const w = box.x1 - box.x0;
    const h = box.bottom - box.top;
    const s = Math.min(w, h) * 0.62;
    const cx = box.x0 + w * 0.46;
    const cy = box.top + h * 0.52;
    const H = this.height;
    const p1 = { x: cx - s * 0.5, y: H - cy };
    const p2 = { x: cx - s * 0.12, y: H - (cy + s * 0.42) };
    const p3 = { x: cx + s * 0.62, y: H - (cy - s * 0.62) };
    this.page.drawLine({ start: p1, end: p2, thickness: 1.4, color: INK });
    this.page.drawLine({ start: p2, end: p3, thickness: 1.4, color: INK });
  }

  image(img: PDFImage, x0: number, x1: number, top: number, bottom: number) {
    const boxW = x1 - x0;
    const boxH = bottom - top;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    this.page.drawImage(img, {
      x: x0 + (boxW - w) / 2,
      y: this.height - bottom + (boxH - h) / 2,
      width: w,
      height: h,
    });
  }
}

function isChecked(f: Extract<Tax101Field, { kind: "check" }>, data: Tax101FormData): boolean {
  const v = getPath(data, f.path);
  return f.value === undefined ? v === true : v === f.value;
}

function drawField(w: Writer, f: Tax101Field, data: Tax101FormData) {
  if (f.dependsOn && getPath(data, f.dependsOn) !== true) return;
  const row = rowOf(f.path);
  if (row) {
    const list = getPath(data, row.table) as unknown[] | undefined;
    if (isRowEmpty(list?.[row.index], ROW_KEYS[row.table])) return;
  }

  const raw = getPath(data, f.path);
  switch (f.kind) {
    case "check":
      if (isChecked(f, data)) w.check(f.box);
      return;
    case "cells":
      w.cells(cellChars(raw, f.n, f.skipFirst), f.x, f.pitch, f.top, f.h);
      return;
    case "dateCells":
      w.cells(cellChars(dateToCells(raw as string), 8), f.x, f.pitch, f.top, f.h);
      return;
    case "dateLine": {
      if (f.slashes) {
        const d = splitIsoDate(raw as string);
        if (!d) return;
        const [s1, s2] = f.slashes;
        w.text(d.dd, s1 - 13, 12, f.top, f.h, { align: "center", size: 8.5 });
        w.text(d.mm, s1 + 1, s2 - s1 - 1, f.top, f.h, { align: "center", size: 8.5 });
        w.text(d.yyyy, s2 + 2, f.x + f.w - s2 - 2, f.top, f.h, { align: "left", size: 8.5 });
        return;
      }
      w.text(formatDmy(raw as string), f.x, f.w, f.top, f.h, { align: "center", size: f.h >= 13 ? 8.5 : 8 });
      return;
    }
    case "phone": {
      const { prefix, rest } = splitPhone(raw as string);
      if (!prefix && !rest) return;
      if (prefix) w.text(prefix, f.x, f.slashX - f.x - 2, f.top, f.h, { align: "right" });
      w.text(rest, f.slashX + 4, f.x + f.w - f.slashX - 4, f.top, f.h, { align: "left" });
      return;
    }
    case "text": {
      let text = raw === undefined || raw === null ? "" : String(raw);
      if (f.skipFirst) text = text.slice(1);
      w.text(text, f.x, f.w, f.top, f.h, { size: f.size, align: f.numeric ? "center" : undefined });
      if (f.box && typeof raw === "number" && raw > 0) w.check(f.box);
      return;
    }
  }
}

async function embedSignature(pdf: PDFDocument, dataUrl: string): Promise<PDFImage> {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return dataUrl.startsWith("data:image/jpeg") ? pdf.embedJpg(bytes) : pdf.embedPng(bytes);
}

/** Fills the official Form 101 template and returns it as a PDF blob. */
export async function buildTax101Pdf({ data, taxYear, signatureDataUrl, signedAt }: BuildTax101PdfInput): Promise<Blob> {
  const pdf = await PDFDocument.load(await loadTemplate());
  const { regular } = await embedHebrewFonts(pdf);
  const pages = pdf.getPages();
  const writers = pages.map((p) => new Writer(p, regular));

  writers[0].cells(Array.from(String(taxYear)).slice(0, 4), TAX_YEAR_CELLS.x, TAX_YEAR_CELLS.pitch, TAX_YEAR_CELLS.top, TAX_YEAR_CELLS.h);

  for (const f of TAX101_FIELDS) drawField(writers[f.page], f, data);

  if (signatureDataUrl) {
    const sig = await embedSignature(pdf, signatureDataUrl);
    const { signature, date } = DECLARATION;
    writers[1].image(sig, signature.x0, signature.x1, signature.top, signature.bottom);
    const d = signedAt ?? new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    writers[1].text(formatDmy(iso), date.x, date.w, date.top, date.h, { align: "center", size: 9 });

    // Section ז: each reported change is signed by the employee in its own row.
    data.year_changes.forEach((row, r) => {
      if (isRowEmpty(row, ROW_KEYS.year_changes)) return;
      const top = YEAR_CHANGE_ROW_TOP + YEAR_CHANGE_ROW_PITCH * r + 1;
      writers[0].image(sig, YEAR_CHANGE_SIGNATURE_X.x0, YEAR_CHANGE_SIGNATURE_X.x1, top, top + YEAR_CHANGE_ROW_PITCH - 2);
    });
  }

  pdf.setTitle(`טופס 101 לשנת ${taxYear}`);
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
