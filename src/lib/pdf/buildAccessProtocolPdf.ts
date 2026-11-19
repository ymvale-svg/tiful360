import { rgb, type PDFPage } from "pdf-lib";
import { createHebrewDoc, drawFooterOnAllPages, drawLtrText, drawRtlText, embedLogo, shapeForVisual } from "./hebrewPdf";
import { formatIsraelDateTime, type EmployeeProtocolRow } from "@/domain/systemAccess/protocol";

export interface AccessProtocolInput {
  documentId: string;
  companyName: string;
  companyLogoUrl?: string | null;
  generatedBy: string;
  employeeName: string;
  employeeCode: string | null;
  role: string | null;
  department: string | null;
  startDate: string | null;
  endDate: string | null;
  rows: EmployeeProtocolRow[];
}

const GRAY = { r: 0.42, g: 0.45, b: 0.5 };
const LINE = rgb(0.85, 0.87, 0.9);
// A4 landscape: the history needs nine columns.
const W = 842;
const H = 595;
const M = 32;

/** Columns from the right edge: width and how to read a row. */
const COLUMNS: Array<{ title: string; width: number; value: (r: EmployeeProtocolRow) => string; ltr?: boolean }> = [
  { title: "מערכת", width: 82, value: (r) => r.system },
  { title: "הרשאה", width: 120, value: (r) => (r.externalGroup ? `${r.target} · ${r.externalGroup}` : r.target) },
  { title: "ביקש/ה", width: 70, value: (r) => r.requestedBy ?? "—" },
  { title: "בתוקף מ", width: 78, value: (r) => formatIsraelDateTime(r.effectiveFrom), ltr: true },
  { title: "נפתח בפועל", width: 78, value: (r) => formatIsraelDateTime(r.openedAt), ltr: true },
  { title: "נפתח ע\"י", width: 70, value: (r) => r.openedBy ?? "—" },
  { title: "משתמש", width: 66, value: (r) => r.username ?? "—", ltr: true },
  { title: "נותק", width: 78, value: (r) => formatIsraelDateTime(r.revokedAt), ltr: true },
  { title: "נותק ע\"י", width: 70, value: (r) => r.revokedBy ?? "—" },
  { title: "סטטוס", width: 66, value: (r) => r.status },
];

/** One document per employee: every access, by system, with requested start, opening and revocation. */
export async function buildAccessProtocolPdf(input: AccessProtocolInput): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();
  const logo = await embedLogo(pdf, input.companyLogoUrl ?? null).catch(() => null);
  const size = 7.5;
  const rowH = 15;

  const fit = (text: string, width: number) => {
    let t = text ?? "";
    if (regular.widthOfTextAtSize(shapeForVisual(t), size) <= width) return t;
    while (t.length > 1 && regular.widthOfTextAtSize(shapeForVisual(`${t}…`), size) > width) t = t.slice(0, -1);
    return `${t}…`;
  };

  const header = (page: PDFPage, first: boolean) => {
    let y = H - M;
    if (logo && first) {
      const scale = Math.min(90 / logo.width, 36 / logo.height);
      page.drawImage(logo, { x: M, y: y - logo.height * scale + 6, width: logo.width * scale, height: logo.height * scale });
    }
    drawRtlText({ page, text: input.companyName, font: bold, size: 11, rightX: W - M, y });
    y -= 18;
    drawRtlText({ page, text: "פרוטוקול הרשאות למערכות", font: bold, size: 15, rightX: W - M, y });
    drawLtrText({ page, text: input.documentId, font: regular, size: 8, x: M, y, color: GRAY });
    y -= 18;
    if (first) {
      const details = [
        input.employeeName,
        input.employeeCode ? `מספר עובד ${input.employeeCode}` : null,
        input.role,
        input.department,
        input.startDate ? `תחילת עבודה ${input.startDate.split("-").reverse().join("/")}` : null,
        input.endDate ? `סיום עבודה ${input.endDate.split("-").reverse().join("/")}` : null,
      ].filter(Boolean).join(" · ");
      drawRtlText({ page, text: details, font: regular, size: 9, rightX: W - M, y });
      y -= 14;
      drawRtlText({
        page,
        text: `הופק ע"י ${input.generatedBy} · ${formatIsraelDateTime(new Date().toISOString())} · שעון ישראל`,
        font: regular, size: 8, rightX: W - M, y, color: GRAY,
      });
      y -= 18;
    }
    // Column titles
    let x = W - M;
    for (const c of COLUMNS) {
      drawRtlText({ page, text: c.title, font: bold, size, rightX: x - 3, y });
      x -= c.width;
    }
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.8, color: LINE });
    return y - rowH;
  };

  let page = pdf.addPage([W, H]);
  let y = header(page, true);
  if (input.rows.length === 0) {
    drawRtlText({ page, text: "לעובד אין הרשאות למערכות.", font: regular, size: 10, rightX: W - M, y });
  }
  let lastSystem: string | null = null;
  for (const r of input.rows) {
    if (y < M + 30) {
      page = pdf.addPage([W, H]);
      y = header(page, false);
      lastSystem = null;
    }
    let x = W - M;
    for (const c of COLUMNS) {
      // The system name prints once per block of its rows.
      const raw = c.title === "מערכת" && r.system === lastSystem ? "" : c.value(r);
      const text = fit(raw, c.width - 6);
      if (c.ltr) {
        const w = regular.widthOfTextAtSize(shapeForVisual(text, false), size);
        drawLtrText({ page, text, font: regular, size, x: x - 3 - w, y });
      } else {
        drawRtlText({ page, text, font: c.title === "מערכת" ? bold : regular, size, rightX: x - 3, y });
      }
      x -= c.width;
    }
    lastSystem = r.system;
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: LINE });
    y -= rowH;
  }

  drawFooterOnAllPages(pdf, regular);
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
