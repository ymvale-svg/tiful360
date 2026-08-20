import { rgb } from "pdf-lib";
import {
  createHebrewDoc,
  drawRtlText,
  drawCenteredRtlText,
  embedSignaturePng,
  embedLogo,
  wrapTextLines,
  drawFooterOnAllPages,
  shapeForVisual,
} from "./hebrewPdf";
import type { ProtocolPdfData } from "./types";

const W = 595;
const H = 842;
const MARGIN_R = 545;
const MARGIN_L = 50;
const CONTENT_W = MARGIN_R - MARGIN_L;

function fmtDateTime(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

export async function buildProtocolPdf(data: ProtocolPdfData): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();

  let page = pdf.addPage([W, H]);
  let y = H - 50;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - 60;
  };
  const ensure = (needed: number) => {
    if (y - needed < 70) newPage();
  };

  // ===== Header: logo + company name =====
  const logo = await embedLogo(pdf, data.companyLogoUrl ?? null);
  if (logo) {
    const ratio = logo.width / logo.height;
    const h = 46;
    const w = h * ratio;
    page.drawImage(logo, { x: MARGIN_R - w, y: y - h, width: w, height: h });
  }
  if (data.companyName) {
    drawRtlText({
      page,
      text: data.companyName,
      font: bold,
      size: 13,
      rightX: logo ? MARGIN_R - 110 : MARGIN_R,
      y: y - 22,
      color: { r: 0.25, g: 0.25, b: 0.25 },
    });
  }
  y -= 70;

  page.drawLine({
    start: { x: MARGIN_L, y },
    end: { x: MARGIN_R, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 28;

  // ===== Title =====
  const defaultTitle = data.direction === "return" ? "פרוטוקול הזדכות" : "פרוטוקול משיכה";
  drawCenteredRtlText({
    page,
    text: data.title || defaultTitle,
    font: bold,
    size: 17,
    centerX: W / 2,
    y,
  });
  y -= 20;
  drawCenteredRtlText({
    page,
    text: `תאריך ושעה: ${fmtDateTime(data.issuedAt)}`,
    font: regular,
    size: 10,
    centerX: W / 2,
    y,
    color: { r: 0.4, g: 0.4, b: 0.4 },
  });
  y -= 28;

  // ===== Parties =====
  const parties: [string, string][] = [
    ["שם העובד", data.employeeName ?? ""],
    ["ת.ז.", data.employeeIdNumber ?? ""],
    ["מחלקה", data.employeeDepartment ?? ""],
    ["מוסר מטעם החברה", data.issuerName ?? ""],
  ].filter(([, v]) => !!v) as [string, string][];

  for (const [label, value] of parties) {
    ensure(18);
    drawRtlText({ page, text: `${label}:`, font: bold, size: 10.5, rightX: MARGIN_R, y });
    drawRtlText({ page, text: value, font: regular, size: 10.5, rightX: MARGIN_R - 120, y });
    y -= 17;
  }
  y -= 8;

  // ===== Details table =====
  const fields = (data.fields ?? []).filter((f) => f.value !== null && f.value !== undefined && `${f.value}`.trim() !== "");
  if (fields.length) {
    ensure(40);
    drawRtlText({ page, text: "פרטי הפריט", font: bold, size: 12, rightX: MARGIN_R, y });
    y -= 16;

    const ROW_H = 20;
    const LABEL_W = 170;
    for (const f of fields) {
      ensure(ROW_H + 6);
      page.drawRectangle({
        x: MARGIN_L,
        y: y - 5,
        width: CONTENT_W,
        height: ROW_H,
        borderColor: rgb(0.88, 0.88, 0.88),
        borderWidth: 0.7,
        color: rgb(0.985, 0.985, 0.985),
      });
      drawRtlText({ page, text: f.label, font: bold, size: 10, rightX: MARGIN_R - 8, y: y + 1 });
      drawRtlText({
        page,
        text: `${f.value}`,
        font: regular,
        size: 10,
        rightX: MARGIN_R - LABEL_W,
        y: y + 1,
      });
      y -= ROW_H;
    }
    y -= 14;
  }

  // ===== Protocol body text =====
  const paragraphsSource = [data.bodyText, data.freeText].filter(Boolean).join("\n\n");
  if (paragraphsSource.trim()) {
    ensure(40);
    drawRtlText({ page, text: "תנאים והערות", font: bold, size: 12, rightX: MARGIN_R, y });
    y -= 18;
    for (const para of paragraphsSource.split(/\n+/)) {
      if (!para.trim()) {
        y -= 8;
        continue;
      }
      const lines = wrapTextLines(para, regular, 10.5, CONTENT_W);
      for (const line of lines) {
        ensure(18);
        drawRtlText({ page, text: line, font: regular, size: 10.5, rightX: MARGIN_R, y });
        y -= 16;
      }
      y -= 6;
    }
    y -= 8;
  }

  // ===== Media =====
  const images = (data.media ?? []).filter((m) => m.type === "image");
  const videos = (data.media ?? []).filter((m) => m.type === "video");

  if (images.length) {
    ensure(40);
    drawRtlText({ page, text: "תיעוד מצולם", font: bold, size: 12, rightX: MARGIN_R, y });
    y -= 14;

    const CELL_W = (CONTENT_W - 12) / 2;
    const CELL_H = 150;
    let col = 0;
    for (const m of images) {
      const img = await embedSignaturePng(pdf, m.url);
      if (!img) continue;
      if (col === 0) ensure(CELL_H + 20);
      const ratio = img.width / img.height;
      let w = CELL_W;
      let h = w / ratio;
      if (h > CELL_H) {
        h = CELL_H;
        w = h * ratio;
      }
      const cellRight = col === 0 ? MARGIN_R : MARGIN_R - CELL_W - 12;
      page.drawImage(img, { x: cellRight - w, y: y - h, width: w, height: h });
      if (m.label) {
        drawRtlText({
          page,
          text: m.label,
          font: regular,
          size: 8.5,
          rightX: cellRight,
          y: y - h - 11,
          color: { r: 0.45, g: 0.45, b: 0.45 },
        });
      }
      col += 1;
      if (col === 2) {
        col = 0;
        y -= CELL_H + 26;
      }
    }
    if (col === 1) y -= CELL_H + 26;
    y -= 6;
  }

  for (const v of videos) {
    ensure(20);
    drawRtlText({
      page,
      text: `סרטון תיעוד: ${v.label ?? "צפייה בקישור"}`,
      font: regular,
      size: 9.5,
      rightX: MARGIN_R,
      y,
      color: { r: 0.2, g: 0.3, b: 0.7 },
    });
    y -= 14;
    // The URL itself is LTR — draw it as-is, left aligned.
    page.drawText(shapeForVisual(v.url, false), { x: MARGIN_L, y, size: 7.5, font: regular, color: rgb(0.35, 0.35, 0.35) });
    y -= 18;
  }

  // ===== Signatures =====
  ensure(120);
  y -= 10;
  page.drawLine({
    start: { x: MARGIN_L, y: y + 8 },
    end: { x: MARGIN_R, y: y + 8 },
    thickness: 0.8,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 6;

  const SIG_W = 200;
  const SIG_H = 70;
  const boxes: { title: string; sig?: string | null; name?: string | null; rightX: number }[] = [
    {
      title: data.direction === "return" ? "חתימת העובד המחזיר" : "חתימת העובד המקבל",
      sig: data.employeeSignature,
      name: data.employeeName,
      rightX: MARGIN_R,
    },
    {
      title: "חתימת נציג התפעול",
      sig: data.issuerSignature,
      name: data.issuerName,
      rightX: MARGIN_L + SIG_W,
    },
  ];

  for (const b of boxes) {
    drawRtlText({ page, text: b.title, font: bold, size: 10, rightX: b.rightX, y: y - 6 });
    page.drawRectangle({
      x: b.rightX - SIG_W,
      y: y - SIG_H - 16,
      width: SIG_W,
      height: SIG_H,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.7,
    });
    const img = await embedSignaturePng(pdf, b.sig ?? null);
    if (img) {
      const ratio = img.width / img.height;
      let h = SIG_H - 10;
      let w = h * ratio;
      if (w > SIG_W - 10) {
        w = SIG_W - 10;
        h = w / ratio;
      }
      page.drawImage(img, {
        x: b.rightX - SIG_W + (SIG_W - w) / 2,
        y: y - SIG_H - 16 + (SIG_H - h) / 2,
        width: w,
        height: h,
      });
    }
    if (b.name) {
      drawRtlText({
        page,
        text: b.name,
        font: regular,
        size: 9,
        rightX: b.rightX,
        y: y - SIG_H - 28,
        color: { r: 0.45, g: 0.45, b: 0.45 },
      });
    }
  }

  // ===== Footer on every page =====
  drawFooterOnAllPages(pdf, regular);

  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      drawCenteredRtlText({
        page: p,
        text: `עמוד ${i + 1} מתוך ${pages.length}`,
        font: regular,
        size: 8,
        centerX: W / 2,
        y: 38,
        color: { r: 0.55, g: 0.55, b: 0.55 },
      });
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
