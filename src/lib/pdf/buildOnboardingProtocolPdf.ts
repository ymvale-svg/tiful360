import { rgb, PDFFont, PDFPage, PDFDocument } from "pdf-lib";
import { createHebrewDoc, drawLtrText, embedLogo, shapeForVisual } from "./hebrewPdf";

type Color = { r: number; g: number; b: number };

const GRAY: Color = { r: 0.42, g: 0.45, b: 0.5 };
const DARK: Color = { r: 0.1, g: 0.12, b: 0.15 };

function drawRtl(o: {
  page: PDFPage;
  text: string;
  font: PDFFont;
  size: number;
  rightX: number;
  y: number;
  color?: Color;
}) {
  const t = shapeForVisual(o.text ?? "");
  if (!t) return;
  const w = o.font.widthOfTextAtSize(t, o.size);
  o.page.drawText(t, {
    x: o.rightX - w,
    y: o.y,
    size: o.size,
    font: o.font,
    color: rgb(o.color?.r ?? 0, o.color?.g ?? 0, o.color?.b ?? 0),
  });
}

function drawCenteredRtl(o: {
  page: PDFPage;
  text: string;
  font: PDFFont;
  size: number;
  centerX: number;
  y: number;
  color?: Color;
}) {
  const t = shapeForVisual(o.text ?? "");
  if (!t) return;
  const w = o.font.widthOfTextAtSize(t, o.size);
  o.page.drawText(t, {
    x: o.centerX - w / 2,
    y: o.y,
    size: o.size,
    font: o.font,
    color: rgb(o.color?.r ?? 0, o.color?.g ?? 0, o.color?.b ?? 0),
  });
}

/** Truncate a string so it fits into maxWidth at the given size. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const t = text ?? "";
  if (!t) return "";
  if (font.widthOfTextAtSize(shapeForVisual(t), size) <= maxWidth) return t;
  let out = t;
  while (out.length > 1 && font.widthOfTextAtSize(shapeForVisual(out + "…"), size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(shapeForVisual(trial), size) <= maxWidth) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function fmtDateDMY(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB");
  } catch {
    return "—";
  }
}

export function fmtDateTimeDMY(d?: string | null): string {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${dt.toLocaleDateString("en-GB")} ${time}`;
  } catch {
    return "—";
  }
}

export interface OnboardingProtocolItem {
  title: string;
  kind: string; // חומרה / הרשאה / מנוי / רישיון
  category: string;
  subCategory?: string | null;
  owner: string;
  notes?: string | null;
  assetCode?: string | null;
  serialNumber?: string | null;
  /** ISO — filled only on the post-execution version */
  assignedAt?: string | null;
}

export interface OnboardingAuditEntry {
  at: string;
  by: string;
  action: string;
}

export interface OnboardingProtocolData {
  documentId: string;
  version: number;
  companyName: string;
  companyLogoUrl?: string | null;
  generatedBy?: string | null;
  generatedByRole?: string | null;
  employeeName: string;
  employeeCode?: string | null;
  idNumber?: string | null;
  role?: string | null;
  department?: string | null;
  managerName?: string | null;
  startDate?: string | null;
  items: OnboardingProtocolItem[];
  auditLog?: OnboardingAuditEntry[];
  /** data:image/png;base64 signature of the requesting HR user */
  requesterSignature?: string | null;
}

async function embedSignature(pdf: PDFDocument, dataUrl?: string | null) {
  if (!dataUrl || !dataUrl.startsWith("data:image")) return null;
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) return await pdf.embedJpg(bytes);
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function buildOnboardingProtocolPdf(data: OnboardingProtocolData): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 42;
  const RIGHT = PAGE_W - MARGIN;
  const LEFT = MARGIN;

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - MARGIN;
  };

  const ensure = (needed: number) => {
    if (y < MARGIN + needed) newPage();
  };

  // ---- Header -------------------------------------------------------------
  const logo = await embedLogo(pdf, data.companyLogoUrl);
  if (logo) {
    const scale = Math.min(110 / logo.width, 52 / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: RIGHT - w, y: y - h, width: w, height: h });
    y -= h + 10;
  }
  drawRtl({ page, text: data.companyName || "", font: bold, size: 13, rightX: RIGHT, y, color: DARK });
  y -= 24;

  drawCenteredRtl({
    page,
    text: "פרוטוקול בקשת פתיחת הרשאות וציוד",
    font: bold,
    size: 18,
    centerX: PAGE_W / 2,
    y,
    color: DARK,
  });
  y -= 16;
  drawCenteredRtl({
    page,
    text: data.version > 1 ? `גרסה ${data.version} — לאחר ביצוע` : "גרסה 1 — בקשה",
    font: regular,
    size: 10,
    centerX: PAGE_W / 2,
    y,
    color: GRAY,
  });
  y -= 20;

  // Document identity block
  drawRtl({ page, text: "מזהה מסמך:", font: regular, size: 9, rightX: RIGHT, y, color: GRAY });
  drawLtrText({ page, text: data.documentId, font: regular, size: 9, x: RIGHT - 150, y, color: DARK });
  drawRtl({ page, text: "הופק בתאריך:", font: regular, size: 9, rightX: LEFT + 170, y, color: GRAY });
  drawLtrText({ page, text: fmtDateTimeDMY(new Date().toISOString()), font: regular, size: 9, x: LEFT, y, color: DARK });
  y -= 14;
  drawRtl({ page, text: "מפיק הבקשה:", font: regular, size: 9, rightX: RIGHT, y, color: GRAY });
  drawRtl({
    page,
    text: `${data.generatedBy || "—"}${data.generatedByRole ? ` · ${data.generatedByRole}` : ""}`,
    font: bold,
    size: 9,
    rightX: RIGHT - 80,
    y,
    color: DARK,
  });
  y -= 14;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
  y -= 22;

  const section = (title: string) => {
    ensure(70);
    drawRtl({ page, text: title, font: bold, size: 12, rightX: RIGHT, y, color: DARK });
    y -= 16;
  };

  const row = (label: string, value: string) => {
    ensure(40);
    drawRtl({ page, text: label, font: regular, size: 10, rightX: RIGHT, y, color: GRAY });
    drawRtl({ page, text: value || "—", font: bold, size: 10, rightX: RIGHT - 150, y, color: DARK });
    y -= 15;
  };

  // ---- Employee -----------------------------------------------------------
  section("פרטי העובד");
  row("שם מלא", data.employeeName);
  row("מספר עובד", data.employeeCode || "—");
  row("תעודת זהות", data.idNumber || "—");
  row("תפקיד", data.role || "—");
  row("מחלקה", data.department || "—");
  row("מנהל ישיר", data.managerName || "—");
  row("תאריך תחילת עבודה", fmtDateDMY(data.startDate));
  y -= 12;

  // ---- Items table --------------------------------------------------------
  section(`פריטים והרשאות מבוקשים (${data.items.length})`);

  // Column right edges
  const cItem = RIGHT;
  const cKind = RIGHT - 150;
  const cOwner = RIGHT - 215;
  const cNotes = RIGHT - 290;
  const cDate = RIGHT - 400;
  const cTime = RIGHT - 462;

  const tableHeader = () => {
    ensure(50);
    drawRtl({ page, text: "פריט", font: bold, size: 8.5, rightX: cItem, y, color: GRAY });
    drawRtl({ page, text: "סוג", font: bold, size: 8.5, rightX: cKind, y, color: GRAY });
    drawRtl({ page, text: "אחראי", font: bold, size: 8.5, rightX: cOwner, y, color: GRAY });
    drawRtl({ page, text: "הערות", font: bold, size: 8.5, rightX: cNotes, y, color: GRAY });
    drawRtl({ page, text: "תאריך ביצוע", font: bold, size: 8.5, rightX: cDate, y, color: GRAY });
    drawRtl({ page, text: "שעה", font: bold, size: 8.5, rightX: cTime, y, color: GRAY });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    y -= 13;
  };

  if (!data.items.length) {
    drawRtl({ page, text: "לא הוגדרו פריטים בתהליך זה.", font: regular, size: 10, rightX: RIGHT, y, color: GRAY });
    y -= 18;
  } else {
    // group: category > sub-category
    const byCat = new Map<string, Map<string, OnboardingProtocolItem[]>>();
    for (const it of data.items) {
      const cat = it.category || "כללי";
      const sub = it.subCategory || "—";
      if (!byCat.has(cat)) byCat.set(cat, new Map());
      const m = byCat.get(cat)!;
      if (!m.has(sub)) m.set(sub, []);
      m.get(sub)!.push(it);
    }

    for (const [cat, subs] of byCat) {
      ensure(80);
      drawRtl({ page, text: cat, font: bold, size: 10, rightX: RIGHT, y, color: DARK });
      y -= 14;
      tableHeader();
      for (const [sub, list] of subs) {
        if (sub && sub !== "—") {
          ensure(40);
          drawRtl({ page, text: sub, font: bold, size: 8.5, rightX: RIGHT, y, color: GRAY });
          y -= 13;
        }
        for (const it of list) {
          ensure(46);
          const name = it.assetCode ? `${it.title} (${it.assetCode})` : it.title;
          drawRtl({ page, text: fit(name, regular, 9, 140), font: regular, size: 9, rightX: cItem, y, color: DARK });
          drawRtl({ page, text: fit(it.kind, regular, 9, 58), font: regular, size: 9, rightX: cKind, y, color: DARK });
          drawRtl({ page, text: fit(it.owner, regular, 9, 68), font: regular, size: 9, rightX: cOwner, y, color: DARK });
          drawRtl({
            page,
            text: fit(it.notes || "—", regular, 9, 102),
            font: regular,
            size: 9,
            rightX: cNotes,
            y,
            color: DARK,
          });
          if (it.assignedAt) {
            const dt = new Date(it.assignedAt);
            drawLtrText({
              page,
              text: dt.toLocaleDateString("en-GB"),
              font: regular,
              size: 9,
              x: cDate - 58,
              y,
              color: DARK,
            });
            drawLtrText({
              page,
              text: dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
              font: regular,
              size: 9,
              x: cTime - 34,
              y,
              color: DARK,
            });
          } else {
            page.drawLine({
              start: { x: cDate - 62, y: y - 2 },
              end: { x: cDate - 4, y: y - 2 },
              thickness: 0.5,
              color: rgb(0.78, 0.8, 0.84),
            });
            page.drawLine({
              start: { x: cTime - 38, y: y - 2 },
              end: { x: cTime - 4, y: y - 2 },
              thickness: 0.5,
              color: rgb(0.78, 0.8, 0.84),
            });
          }
          y -= 14;
        }
      }
      y -= 8;
    }
  }

  // ---- Declaration & signatures ------------------------------------------
  y -= 8;
  ensure(150);
  section("הצהרת אישור");
  const decl = wrapLines(
    "אני מאשר/ת כי הפריטים וההרשאות המפורטים לעיל נדרשים לעובד/ת לצורך מילוי תפקידו/ה בלבד, בהתאם למדיניות אבטחת המידע של החברה ולעיקרון ההרשאה המזערית. הבקשה מועברת לטיפול מחלקת התפעול ו-IT, ותיעוד מועדי הביצוע בפועל יירשם במסמך זה.",
    regular,
    9.5,
    RIGHT - LEFT
  );
  for (const line of decl) {
    ensure(30);
    drawRtl({ page, text: line, font: regular, size: 9.5, rightX: RIGHT, y, color: DARK });
    y -= 13;
  }

  y -= 26;
  ensure(110);
  const sig = await embedSignature(pdf, data.requesterSignature);
  const sigBoxRight = RIGHT;
  const sigBoxLeftCol = LEFT + 180;

  drawRtl({ page, text: "חתימת מבקש (משאבי אנוש)", font: bold, size: 9.5, rightX: sigBoxRight, y, color: DARK });
  drawRtl({ page, text: "חתימת מאשר מטעם התפעול / IT", font: bold, size: 9.5, rightX: sigBoxLeftCol, y, color: DARK });
  y -= 56;
  if (sig) {
    const scale = Math.min(150 / sig.width, 48 / sig.height);
    page.drawImage(sig, {
      x: sigBoxRight - sig.width * scale,
      y: y + 6,
      width: sig.width * scale,
      height: sig.height * scale,
    });
  }
  page.drawLine({ start: { x: sigBoxRight - 170, y }, end: { x: sigBoxRight, y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({
    start: { x: sigBoxLeftCol - 170, y },
    end: { x: sigBoxLeftCol, y },
    thickness: 0.8,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  drawRtl({ page, text: data.generatedBy || "", font: regular, size: 9, rightX: sigBoxRight, y, color: GRAY });
  y -= 24;

  // ---- Audit log ----------------------------------------------------------
  if (data.auditLog?.length) {
    ensure(90);
    section("יומן שינויים");
    drawRtl({ page, text: "מועד", font: bold, size: 8.5, rightX: RIGHT, y, color: GRAY });
    drawRtl({ page, text: "בוצע על ידי", font: bold, size: 8.5, rightX: RIGHT - 110, y, color: GRAY });
    drawRtl({ page, text: "פעולה", font: bold, size: 8.5, rightX: RIGHT - 230, y, color: GRAY });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    y -= 13;
    for (const e of data.auditLog) {
      ensure(40);
      drawLtrText({ page, text: fmtDateTimeDMY(e.at), font: regular, size: 8.5, x: RIGHT - 104, y, color: DARK });
      drawRtl({ page, text: fit(e.by || "—", regular, 8.5, 110), font: regular, size: 8.5, rightX: RIGHT - 110, y, color: DARK });
      drawRtl({ page, text: fit(e.action || "—", regular, 8.5, 230), font: regular, size: 8.5, rightX: RIGHT - 230, y, color: DARK });
      y -= 13;
    }
  }

  // ---- Footer / page numbers ---------------------------------------------
  const total = pages.length;
  pages.forEach((p, idx) => {
    drawCenteredRtl({
      page: p,
      text: `עמוד ${idx + 1} מתוך ${total}`,
      font: regular,
      size: 8,
      centerX: PAGE_W / 2,
      y: 24,
      color: GRAY,
    });
    drawRtl({
      page: p,
      text: `מסמך ${data.documentId} · גרסה ${data.version}`,
      font: regular,
      size: 8,
      rightX: RIGHT,
      y: 24,
      color: GRAY,
    });
  });

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
