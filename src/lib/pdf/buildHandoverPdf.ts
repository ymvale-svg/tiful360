import { rgb } from "pdf-lib";
import {
  loadTemplateDoc,
  drawRtlText,
  drawCenteredRtlText,
  embedSignaturePng,
  embedLogo,
  wrapTextLines,
} from "./hebrewPdf";
import type { HandoverFormData, HandoverFormAsset } from "./types";

const TEMPLATE_URL = "/templates/receive-template.pdf";
const ROWS_PER_PAGE = 3;

const conditionLabels: Record<string, string> = {
  new: "חדש",
  good: "תקין",
  fair: "בינוני",
};

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB").replace(/\//g, "-");
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

/** Convert legacy single-asset shape into an asset array. */
function normalizeAssets(data: HandoverFormData): HandoverFormAsset[] {
  if (data.assets && data.assets.length > 0) return data.assets;
  if (data.asset_name || data.asset_code) {
    return [{
      asset_name: data.asset_name ?? "",
      asset_code: data.asset_code ?? "",
      category_name: data.category_name,
      manufacturer_model: data.manufacturer_model,
      condition: data.condition,
    }];
  }
  return [];
}

export async function buildHandoverPdf(data: HandoverFormData): Promise<Blob> {
  const { pdf, regular, bold, height, appendTemplatePage } = await loadTemplateDoc(TEMPLATE_URL);

  const assets = normalizeAssets(data);
  const groups = chunk(assets, ROWS_PER_PAGE);
  const totalPages = groups.length;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pageIdx === 0 ? pdf.getPage(0) : await appendTemplatePage();
    const isLast = pageIdx === totalPages - 1;
    const pageAssets = groups[pageIdx];

    // ===== Receiver details (right column, value goes to left of label) =====
    // Labels end approximately at x ≈ 427. Values are drawn right-aligned to x ≈ 420.
    const VALUE_RIGHT = 420;
    drawRtlText({ page, text: data.employee_name || "", font: regular, size: 11, rightX: VALUE_RIGHT, y: 670 });
    drawRtlText({ page, text: data.employee_department || "", font: regular, size: 11, rightX: VALUE_RIGHT, y: 649 });
    drawRtlText({ page, text: fmtDate(data.date), font: regular, size: 11, rightX: VALUE_RIGHT, y: 628 });

    // ===== Equipment table — 3 rows starting under header at y ≈ 558 =====
    // Column centers (right→left): description, manufacturer, serial, condition
    const ROW_TOP = 558;
    const ROW_H = 14;
    const COL_CENTERS = [505, 380, 255, 140]; // desc, manuf, serial, condition

    pageAssets.forEach((a, i) => {
      const y = ROW_TOP - i * ROW_H - 10; // text baseline
      const desc = a.category_name || a.asset_name || "";
      const manuf = a.manufacturer_model || "";
      const serial = a.asset_code || a.serial_number || "";
      const cond = conditionLabels[a.condition ?? "good"] ?? (a.condition || "");

      drawCenteredRtlText({ page, text: desc, font: regular, size: 9, centerX: COL_CENTERS[0], y });
      drawCenteredRtlText({ page, text: manuf, font: regular, size: 9, centerX: COL_CENTERS[1], y });
      // Serial is LTR (alphanumeric, often Latin)
      const sw = regular.widthOfTextAtSize(serial, 9);
      page.drawText(serial, { x: COL_CENTERS[2] - sw / 2, y, size: 9, font: regular });
      drawCenteredRtlText({ page, text: cond, font: regular, size: 9, centerX: COL_CENTERS[3], y });
    });

    // ===== Signatures (last page only) =====
    if (isLast) {
      const SIG_RIGHT_X = 318, SIG_LEFT_X = 108, SIG_Y = 232, SIG_W = 90, SIG_H = 70;

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

    // ===== Page indicator (bottom, above the footer at y≈30) =====
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

  // ===== Optional protocol body — appended as a fresh A4 page =====
  if (data.protocol_body && data.protocol_body.trim()) {
    const W = 595, H = 842;
    const MARGIN_R = 545, MARGIN_L = 50;
    const CONTENT_W = MARGIN_R - MARGIN_L;
    let page = pdf.addPage([W, H]);
    let y = H - 50;

    // Logo (top-right)
    const logo = await embedLogo(pdf, data.company_logo_url ?? null);
    if (logo) {
      const ratio = logo.width / logo.height;
      const h = 50;
      const w = h * ratio;
      page.drawImage(logo, { x: MARGIN_R - w, y: y - h, width: w, height: h });
    }
    if (data.company_name) {
      drawRtlText({
        page, text: data.company_name, font: bold, size: 12,
        rightX: logo ? MARGIN_R - 110 : MARGIN_R, y: y - 25,
        color: { r: 0.3, g: 0.3, b: 0.3 },
      });
    }
    y -= 80;
    page.drawLine({
      start: { x: MARGIN_L, y }, end: { x: MARGIN_R, y },
      thickness: 1, color: rgb(0.85, 0.85, 0.85),
    });
    y -= 30;
    drawCenteredRtlText({
      page, text: data.protocol_title || "פרוטוקול מסירה",
      font: bold, size: 16, centerX: W / 2, y,
    });
    y -= 30;

    const paragraphs = data.protocol_body.split(/\n+/);
    for (const para of paragraphs) {
      if (!para.trim()) { y -= 8; continue; }
      const lines = wrapTextLines(para, regular, 11, CONTENT_W);
      for (const line of lines) {
        if (y < 80) {
          page = pdf.addPage([W, H]);
          y = H - 60;
        }
        drawRtlText({ page, text: line, font: regular, size: 11, rightX: MARGIN_R, y });
        y -= 18;
      }
      y -= 6;
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
