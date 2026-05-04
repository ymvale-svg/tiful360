import { rgb } from "pdf-lib";
import {
  createHebrewDoc,
  drawRtlText,
  drawCenteredRtlText,
  embedLogo,
  embedSignaturePng,
  shapeForVisual,
  wrapTextLines,
} from "./hebrewPdf";
import type { OffboardingFormData } from "@/components/OffboardingFormView";

const conditionLabels: Record<string, string> = {
  good: "תקין",
  damaged: "לא תקין",
  missing: "חסר",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("he-IL"); } catch { return d; }
}

const PAGE_W = 595;
const PAGE_H = 842;
const RIGHT = PAGE_W - 50;
const LEFT = 50;

export async function buildOffboardingPdf(data: OffboardingFormData): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();

  const newPage = () => pdf.addPage([PAGE_W, PAGE_H]);
  let page = newPage();
  let y = PAGE_H - 50;

  // === Header ===
  drawRtlText({ page, text: "בס״ד", font: bold, size: 11, rightX: RIGHT, y });
  drawRtlText({ page, text: `תאריך: ${fmtDate(data.date)}`, font: regular, size: 11, rightX: RIGHT, y: y - 16 });

  const logo = await embedLogo(pdf, data.company_logo_url ?? null);
  if (logo) {
    const lh = 50;
    const lw = (logo.width / logo.height) * lh;
    page.drawImage(logo, { x: LEFT, y: y - 40, width: Math.min(lw, 130), height: lh });
  } else {
    drawRtlText({ page, text: data.company_name, font: bold, size: 12, rightX: LEFT + 130, y });
  }
  y -= 70;

  // === Title ===
  const title = `טופס החזרת ציוד${data.form_index > 1 ? ` #${data.form_index}` : ""}`;
  drawCenteredRtlText({ page, text: title, font: bold, size: 18, centerX: PAGE_W / 2, y });
  page.drawLine({ start: { x: PAGE_W / 2 - 90, y: y - 3 }, end: { x: PAGE_W / 2 + 90, y: y - 3 }, thickness: 0.7, color: rgb(0, 0, 0) });
  drawCenteredRtlText({ page, text: "בעת סיום העסקה", font: regular, size: 10, centerX: PAGE_W / 2, y: y - 18, color: { r: 0.4, g: 0.4, b: 0.4 } });
  y -= 40;

  // === Receiver details ===
  drawRtlText({ page, text: "אני הח״מ מאשר/ת בזאת כי החזרתי לחברה את הציוד המפורט מטה:", font: regular, size: 11, rightX: RIGHT, y });
  y -= 20;

  const detailLines: string[] = [
    `שם מלא: ${data.employee_name}`,
  ];
  if (data.employee_id_number) detailLines.push(`ת״ז: ${data.employee_id_number}`);
  detailLines.push(`מחלקה / יחידה: ${data.employee_department}`);
  if (data.employee_role) detailLines.push(`תפקיד: ${data.employee_role}`);
  if (data.end_date) detailLines.push(`תאריך סיום עבודה: ${fmtDate(data.end_date)}`);

  for (const ln of detailLines) {
    drawRtlText({ page, text: `• ${ln}`, font: regular, size: 11, rightX: RIGHT - 10, y });
    y -= 16;
  }
  y -= 10;

  // === Equipment table ===
  const cols = [
    { title: "תיאור הפריט", w: 140 },
    { title: "יצרן ומודל", w: 95 },
    { title: "מס׳ סידורי", w: 90 },
    { title: "מצב בעת ההחזרה", w: 80 },
    { title: "הערות", w: 90 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const tableRight = RIGHT;
  const tableLeft = tableRight - tableW;

  const drawTableHeader = () => {
    const headerH = 24;
    page.drawRectangle({ x: tableLeft, y: y - headerH, width: tableW, height: headerH, color: rgb(0.93, 0.93, 0.93) });
    let cx = tableRight;
    for (const c of cols) {
      page.drawRectangle({ x: cx - c.w, y: y - headerH, width: c.w, height: headerH, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.7 });
      drawCenteredRtlText({ page, text: c.title, font: bold, size: 9, centerX: cx - c.w / 2, y: y - headerH + 8 });
      cx -= c.w;
    }
    y -= headerH;
  };

  drawTableHeader();

  for (const a of data.assets) {
    // Compute row height based on text wrapping
    const descLines = wrapTextLines(a.asset_name + (a.category_name ? `\n${a.category_name}` : ""), regular, 9, cols[0].w - 8);
    const notesLines = wrapTextLines(a.notes || "—", regular, 9, cols[4].w - 8);
    const lineCount = Math.max(descLines.length + (a.asset_code ? 1 : 0), notesLines.length, 1);
    const rowH = Math.max(28, 8 + lineCount * 12 + 8);

    if (y - rowH < 200) {
      // page break — keep room for signatures/declaration
      page = newPage();
      y = PAGE_H - 50;
      drawTableHeader();
    }

    let cx = tableRight;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      page.drawRectangle({ x: cx - c.w, y: y - rowH, width: c.w, height: rowH, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.7 });
      cx -= c.w;
    }

    // Cell 0: description (RTL)
    let cellRight = tableRight;
    let textY = y - 12;
    for (const dl of descLines) {
      drawRtlText({ page, text: dl, font: regular, size: 9, rightX: cellRight - 4, y: textY });
      textY -= 12;
    }
    if (a.asset_code) {
      const codeStr = a.asset_code;
      const cw = regular.widthOfTextAtSize(codeStr, 8);
      page.drawText(codeStr, { x: cellRight - cols[0].w / 2 - cw / 2, y: textY, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
    }

    // Cell 1: manufacturer
    cellRight -= cols[0].w;
    drawCenteredRtlText({ page, text: a.manufacturer_model || "—", font: regular, size: 9, centerX: cellRight - cols[1].w / 2, y: y - rowH / 2 - 3 });

    // Cell 2: serial (LTR)
    cellRight -= cols[1].w;
    const serial = a.serial_number || "—";
    const sw = regular.widthOfTextAtSize(serial, 9);
    page.drawText(serial, { x: cellRight - cols[2].w / 2 - sw / 2, y: y - rowH / 2 - 3, size: 9, font: regular });

    // Cell 3: condition
    cellRight -= cols[2].w;
    drawCenteredRtlText({ page, text: conditionLabels[a.condition_at_return ?? "good"] ?? "—", font: regular, size: 9, centerX: cellRight - cols[3].w / 2, y: y - rowH / 2 - 3 });

    // Cell 4: notes
    cellRight -= cols[3].w;
    let nty = y - 12;
    for (const nl of notesLines) {
      drawRtlText({ page, text: nl, font: regular, size: 9, rightX: cellRight - 4, y: nty });
      nty -= 12;
    }

    y -= rowH;
  }

  y -= 20;

  // === Declaration ===
  if (y < 220) { page = newPage(); y = PAGE_H - 50; }

  drawRtlText({ page, text: "הצהרה:", font: bold, size: 12, rightX: RIGHT, y });
  page.drawLine({ start: { x: RIGHT - 40, y: y - 2 }, end: { x: RIGHT, y: y - 2 }, thickness: 0.5 });
  y -= 18;

  const decl = [
    "אני מאשר/ת שהחזרתי את כל הציוד המפורט בטופס זה לחברה.",
    "המצב המתואר בעמודת \"מצב בעת ההחזרה\" משקף את מצב הציוד בעת מסירתו.",
    "ידוע לי כי במקרה של ציוד חסר או פגום עקב רשלנות, החברה רשאית לפעול בהתאם למדיניותה.",
    "אני מאשר/ת כי מחקתי כל מידע אישי מהמכשירים שהוחזרו.",
  ];
  let idx = 1;
  for (const para of decl) {
    const wrapped = wrapTextLines(`${idx}. ${para}`, regular, 10, RIGHT - LEFT - 25);
    for (const wl of wrapped) {
      drawRtlText({ page, text: wl, font: regular, size: 10, rightX: RIGHT - 10, y });
      y -= 14;
    }
    y -= 4;
    idx++;
  }

  // === Signatures ===
  if (y < 110) { page = newPage(); y = PAGE_H - 100; }
  y -= 25;
  const sigBoxW = 200;
  const sigBoxH = 60;
  const sigY = y - sigBoxH;

  // Issuer (left)
  const issuerCx = LEFT + sigBoxW / 2;
  drawCenteredRtlText({ page, text: "אישור מקבל הציוד (מחסן/מחשוב)", font: regular, size: 10, centerX: issuerCx, y: y + 5 });
  page.drawLine({ start: { x: LEFT, y: sigY }, end: { x: LEFT + sigBoxW, y: sigY }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  const issuerImg = await embedSignaturePng(pdf, data.issuer_signature ?? null);
  if (issuerImg) {
    const h = sigBoxH - 5;
    const w = Math.min(sigBoxW - 10, (issuerImg.width / issuerImg.height) * h);
    page.drawImage(issuerImg, { x: issuerCx - w / 2, y: sigY + 2, width: w, height: h });
  }
  drawCenteredRtlText({ page, text: "חתימה", font: regular, size: 9, centerX: issuerCx, y: sigY - 12 });

  // Receiver (right)
  const receiverCx = RIGHT - sigBoxW / 2;
  drawCenteredRtlText({ page, text: "חתימת המחזיר", font: regular, size: 10, centerX: receiverCx, y: y + 5 });
  page.drawLine({ start: { x: RIGHT - sigBoxW, y: sigY }, end: { x: RIGHT, y: sigY }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  const receiverImg = await embedSignaturePng(pdf, data.receiver_signature ?? null);
  if (receiverImg) {
    const h = sigBoxH - 5;
    const w = Math.min(sigBoxW - 10, (receiverImg.width / receiverImg.height) * h);
    page.drawImage(receiverImg, { x: receiverCx - w / 2, y: sigY + 2, width: w, height: h });
  }
  drawCenteredRtlText({ page, text: data.employee_name, font: regular, size: 9, centerX: receiverCx, y: sigY - 12 });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
