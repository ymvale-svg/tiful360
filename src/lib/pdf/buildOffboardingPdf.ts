import { rgb } from "pdf-lib";
import {
  loadTemplateDoc,
  drawRtlText,
  drawCenteredRtlText,
  embedSignaturePng,
  wrapTextLines,
} from "./hebrewPdf";
import type { OffboardingFormData } from "./types";

const TEMPLATE_URL = "/templates/return-template.pdf";
const ROWS_PER_PAGE = 3;

const conditionLabels: Record<string, string> = {
  good: "תקין",
  damaged: "לא תקין",
  missing: "חסר",
};

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("he-IL");
  } catch {
    return d;
  }
}

function chunk<T>(arr: T[], n: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Aggregate per-asset condition into one overall status (worst wins). */
function aggregateCondition(data: OffboardingFormData): "good" | "damaged" | "missing" {
  if (data.overall_condition) return data.overall_condition;
  const conds = (data.assets ?? []).map((a) => a.condition_at_return ?? "good");
  if (conds.includes("missing")) return "missing";
  if (conds.includes("damaged")) return "damaged";
  return "good";
}

/** Concatenate per-asset notes into one short line (truncated). */
function aggregateNotes(data: OffboardingFormData): string {
  if (data.general_notes && data.general_notes.trim()) return data.general_notes.trim();
  const all = (data.assets ?? [])
    .map((a) => a.notes?.trim())
    .filter(Boolean) as string[];
  return all.join("; ");
}

export async function buildOffboardingPdf(data: OffboardingFormData): Promise<Blob> {
  const { pdf, regular, bold, appendTemplatePage } = await loadTemplateDoc(TEMPLATE_URL);

  const assets = data.assets ?? [];
  const groups = chunk(assets, ROWS_PER_PAGE);
  const totalPages = groups.length;

  const overall = aggregateCondition(data);
  const notes = aggregateNotes(data);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pageIdx === 0 ? pdf.getPage(0) : await appendTemplatePage();
    const isLast = pageIdx === totalPages - 1;
    const pageAssets = groups[pageIdx];

    // ===== Receiver details =====
    const VALUE_RIGHT = 420;
    drawRtlText({ page, text: data.employee_name || "", font: regular, size: 11, rightX: VALUE_RIGHT, y: 670 });
    drawRtlText({ page, text: data.employee_department || "", font: regular, size: 11, rightX: VALUE_RIGHT, y: 649 });
    drawRtlText({ page, text: fmtDate(data.end_date || data.date), font: regular, size: 11, rightX: VALUE_RIGHT, y: 628 });

    // ===== Equipment table — 3 rows under header =====
    const ROW_TOP = 558;
    const ROW_H = 14;
    const COL_CENTERS = [505, 380, 255, 140];

    pageAssets.forEach((a, i) => {
      const y = ROW_TOP - i * ROW_H - 10;
      const desc = a.category_name || a.asset_name || "";
      const manuf = a.manufacturer_model || "";
      const serial = a.serial_number || a.asset_code || "";
      const cond = conditionLabels[a.condition_at_return ?? "good"] ?? "תקין";

      drawCenteredRtlText({ page, text: desc, font: regular, size: 9, centerX: COL_CENTERS[0], y });
      drawCenteredRtlText({ page, text: manuf, font: regular, size: 9, centerX: COL_CENTERS[1], y });
      const sw = regular.widthOfTextAtSize(serial, 9);
      page.drawText(serial, { x: COL_CENTERS[2] - sw / 2, y, size: 9, font: regular });
      drawCenteredRtlText({ page, text: cond, font: regular, size: 9, centerX: COL_CENTERS[3], y });
    });

    // ===== Last-page-only fields: condition checkboxes, notes, signatures =====
    if (isLast) {
      // Status checkboxes (sec 2): "תקין (בלאי סביר) / לא תקין / חסר"
      // Checkbox positions extracted from text "□" anchors in the template at y ≈ 416.
      // Approximate centers: good=343, damaged=285, missing=240
      const CB_Y = 419;
      const drawCheck = (cx: number) => {
        // X mark inside the existing □ on the template
        page.drawText("✓", {
          x: cx - 3,
          y: CB_Y - 1,
          size: 11,
          font: bold,
          color: rgb(0, 0, 0),
        });
      };
      if (overall === "good") drawCheck(345);
      else if (overall === "damaged") drawCheck(287);
      else if (overall === "missing") drawCheck(242);

      // Notes (sec 3): write over the placeholder "לחץ או הקש כאן..." at y ≈ 405
      if (notes) {
        // White rectangle to mask the placeholder text
        page.drawRectangle({
          x: 100,
          y: 397,
          width: 240,
          height: 14,
          color: rgb(1, 1, 1),
        });
        const noteLines = wrapTextLines(notes, regular, 9, 235);
        let ny = 407;
        for (const line of noteLines.slice(0, 2)) {
          drawRtlText({ page, text: line, font: regular, size: 9, rightX: 335, y: ny });
          ny -= 11;
        }
      }

      // Signatures
      const SIG_RIGHT_X = 318, SIG_LEFT_X = 108, SIG_Y = 305, SIG_W = 90, SIG_H = 75;

      const receiverImg = await embedSignaturePng(pdf, data.receiver_signature ?? null);
      if (receiverImg) {
        const ratio = receiverImg.width / receiverImg.height;
        const h = Math.min(SIG_H - 6, (SIG_W - 6) / ratio);
        const w = h * ratio;
        page.drawImage(receiverImg, {
          x: SIG_RIGHT_X + (SIG_W - w) / 2,
          y: SIG_Y + (SIG_H - h) / 2,
          width: w,
          height: h,
        });
      }
      const issuerImg = await embedSignaturePng(pdf, data.issuer_signature ?? null);
      if (issuerImg) {
        const ratio = issuerImg.width / issuerImg.height;
        const h = Math.min(SIG_H - 6, (SIG_W - 6) / ratio);
        const w = h * ratio;
        page.drawImage(issuerImg, {
          x: SIG_LEFT_X + (SIG_W - w) / 2,
          y: SIG_Y + (SIG_H - h) / 2,
          width: w,
          height: h,
        });
      }
    }

    if (totalPages > 1) {
      drawCenteredRtlText({
        page,
        text: `עמוד ${pageIdx + 1} מתוך ${totalPages}`,
        font: regular,
        size: 9,
        centerX: 297,
        y: 50,
        color: { r: 0.4, g: 0.4, b: 0.4 },
      });
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
