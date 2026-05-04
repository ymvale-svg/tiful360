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
import type { HandoverFormData } from "@/components/HandoverFormView";

const conditionLabels: Record<string, string> = { new: "חדש", good: "תקין", fair: "בינוני" };

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("he-IL"); } catch { return d; }
}

export async function buildHandoverPdf(data: HandoverFormData): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();
  const page = pdf.addPage([595, 842]); // A4
  const W = 595, H = 842;
  const RIGHT = W - 50;
  const LEFT = 50;
  let y = H - 50;

  // Header — logo on left, date/בס״ד on right
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

  // Title
  drawCenteredRtlText({ page, text: "הצהרת קבלת ציוד", font: bold, size: 18, centerX: W / 2, y });
  page.drawLine({ start: { x: W / 2 - 70, y: y - 3 }, end: { x: W / 2 + 70, y: y - 3 }, thickness: 0.7, color: rgb(0, 0, 0) });
  y -= 35;

  // Receiver details
  drawRtlText({ page, text: "אני הח״מ מאשר/ת בזאת כי קיבלתי לרשותי את הציוד המפורט מטה:", font: regular, size: 11, rightX: RIGHT, y });
  y -= 20;
  const lines = [
    `שם מלא: ${data.employee_name}`,
    `מחלקה / יחידה: ${data.employee_department}`,
    `תאריך משיכה: ${fmtDate(data.date)}`,
  ];
  for (const ln of lines) {
    drawRtlText({ page, text: `• ${ln}`, font: regular, size: 11, rightX: RIGHT - 10, y });
    y -= 16;
  }
  y -= 10;

  // Equipment table
  const cols = [
    { title: "תיאור הפריט", w: 175 },
    { title: "יצרן ומודל", w: 130 },
    { title: "מס׳ סידורי", w: 110 },
    { title: "מצב הציוד", w: 80 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const tableRight = RIGHT;
  const tableLeft = tableRight - tableW;
  const rowH = 28;

  // Header row
  page.drawRectangle({ x: tableLeft, y: y - rowH, width: tableW, height: rowH, color: rgb(0.93, 0.93, 0.93) });
  let cx = tableRight;
  for (const c of cols) {
    page.drawRectangle({ x: cx - c.w, y: y - rowH, width: c.w, height: rowH, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.7 });
    drawCenteredRtlText({ page, text: c.title, font: bold, size: 10, centerX: cx - c.w / 2, y: y - rowH + 10 });
    cx -= c.w;
  }
  y -= rowH;

  // Data row
  const cells = [
    data.category_name || data.asset_name,
    data.manufacturer_model || data.asset_name || "—",
    data.asset_code || "—",
    conditionLabels[data.condition] ?? data.condition,
  ];
  cx = tableRight;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    page.drawRectangle({ x: cx - c.w, y: y - rowH, width: c.w, height: rowH, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.7 });
    if (i === 2) {
      // serial — LTR mono
      const txt = String(cells[i]);
      const w = regular.widthOfTextAtSize(txt, 10);
      page.drawText(txt, { x: cx - c.w / 2 - w / 2, y: y - rowH + 10, size: 10, font: regular });
    } else {
      drawCenteredRtlText({ page, text: String(cells[i]), font: regular, size: 10, centerX: cx - c.w / 2, y: y - rowH + 10 });
    }
    cx -= c.w;
  }
  y -= rowH + 25;

  // Declaration
  drawRtlText({ page, text: "הצהרה והתחייבות:", font: bold, size: 12, rightX: RIGHT, y });
  page.drawLine({ start: { x: RIGHT - 90, y: y - 2 }, end: { x: RIGHT, y: y - 2 }, thickness: 0.5, color: rgb(0, 0, 0) });
  y -= 18;

  const decl = [
    "אני מתחייב/ת לשמור על הציוד שקיבלתי, לעשות בו שימוש סביר ובהתאם לייעודו, ולהחזירו במצב תקין לחברה עם סיום העסקתי או על פי דרישתה.",
    "ידוע לי כי הציוד הינו רכוש החברה בלבד, וכי אינני רשאי/ת להעבירו לאחר, להשאילו, למוכרו או לעשות בו שימוש למטרות שאינן קשורות לעבודתי.",
    "במקרה של נזק, אובדן או גניבה — מתחייב/ת לדווח באופן מיידי לגורם המנפק, ולשאת באחריות בהתאם למדיניות החברה.",
    "ידוע לי כי החברה רשאית לקזז משכרי או מכל סכום אחר המגיע לי, את עלות הציוד שלא הוחזר או שניזוק עקב רשלנות או שימוש לא סביר.",
  ];
  const declMaxW = RIGHT - LEFT - 25;
  let idx = 1;
  for (const para of decl) {
    const wrapped = wrapTextLines(`${idx}. ${para}`, regular, 10, declMaxW);
    for (const wl of wrapped) {
      drawRtlText({ page, text: wl, font: regular, size: 10, rightX: RIGHT - 10, y });
      y -= 14;
    }
    y -= 4;
    idx++;
  }

  // Signatures
  y -= 30;
  const sigBoxW = 200;
  const sigBoxH = 60;
  const sigY = y - sigBoxH;

  // Issuer (left side)
  const issuerCx = LEFT + sigBoxW / 2;
  drawCenteredRtlText({ page, text: "אישור גורם מנפק (מחסן/מחשוב)", font: regular, size: 10, centerX: issuerCx, y: y + 5 });
  page.drawLine({ start: { x: LEFT, y: sigY }, end: { x: LEFT + sigBoxW, y: sigY }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  const issuerImg = await embedSignaturePng(pdf, data.issuer_signature ?? null);
  if (issuerImg) {
    const h = sigBoxH - 5;
    const w = Math.min(sigBoxW - 10, (issuerImg.width / issuerImg.height) * h);
    page.drawImage(issuerImg, { x: issuerCx - w / 2, y: sigY + 2, width: w, height: h });
  }
  drawCenteredRtlText({ page, text: "חתימה", font: regular, size: 9, centerX: issuerCx, y: sigY - 12 });

  // Receiver (right side)
  const receiverCx = RIGHT - sigBoxW / 2;
  drawCenteredRtlText({ page, text: "חתימת המושך", font: regular, size: 10, centerX: receiverCx, y: y + 5 });
  page.drawLine({ start: { x: RIGHT - sigBoxW, y: sigY }, end: { x: RIGHT, y: sigY }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  const receiverImg = await embedSignaturePng(pdf, data.receiver_signature ?? null);
  if (receiverImg) {
    const h = sigBoxH - 5;
    const w = Math.min(sigBoxW - 10, (receiverImg.width / receiverImg.height) * h);
    page.drawImage(receiverImg, { x: receiverCx - w / 2, y: sigY + 2, width: w, height: h });
  }
  drawCenteredRtlText({ page, text: data.employee_name, font: regular, size: 9, centerX: receiverCx, y: sigY - 12 });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
