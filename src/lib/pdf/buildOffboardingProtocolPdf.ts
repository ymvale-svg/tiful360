import { rgb } from "pdf-lib";
import { createHebrewDoc, drawRtlText, drawCenteredRtlText, embedLogo, wrapTextLines } from "./hebrewPdf";

export interface OffboardingProtocolData {
  companyName: string;
  companyLogoUrl?: string | null;
  employeeName: string;
  employeeCode?: string | null;
  idNumber?: string | null;
  department?: string | null;
  role?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  endDateRecordedAt?: string | null;
  accessRevokedAt?: string | null;
  status?: string | null;
  assets: Array<{ asset_name?: string; asset_code?: string; category?: string; domain?: string }>;
  generatedBy?: string | null;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB");
  } catch {
    return "—";
  }
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export async function buildOffboardingProtocolPdf(data: OffboardingProtocolData): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 48;
  const RIGHT = PAGE_W - MARGIN;
  const gray = { r: 0.42, g: 0.45, b: 0.5 };
  const dark = { r: 0.1, g: 0.12, b: 0.15 };

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  // Logo (top-right, above the title)
  const logo = await embedLogo(pdf, data.companyLogoUrl);
  if (logo) {
    const maxW = 120;
    const maxH = 56;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: RIGHT - w, y: y - h, width: w, height: h });
    y -= h + 12;
  }

  drawRtlText({ page, text: data.companyName, font: bold, size: 13, rightX: RIGHT, y, color: dark });
  y -= 26;

  drawCenteredRtlText({ page, text: "פרוטוקול סיום העסקה", font: bold, size: 20, centerX: PAGE_W / 2, y, color: dark });
  y -= 18;
  drawCenteredRtlText({
    page,
    text: `הופק בתאריך ${fmtDateTime(new Date().toISOString())}`,
    font: regular,
    size: 9,
    centerX: PAGE_W / 2,
    y,
    color: gray,
  });
  y -= 20;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: RIGHT, y },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });
  y -= 26;

  const section = (title: string) => {
    if (y < MARGIN + 80) newPage();
    drawRtlText({ page, text: title, font: bold, size: 12, rightX: RIGHT, y, color: dark });
    y -= 16;
  };

  const row = (label: string, value: string) => {
    if (y < MARGIN + 40) newPage();
    drawRtlText({ page, text: label, font: regular, size: 10, rightX: RIGHT, y, color: gray });
    drawRtlText({ page, text: value, font: bold, size: 10, rightX: RIGHT - 170, y, color: dark });
    y -= 16;
  };

  section("פרטי העובד");
  row("שם מלא", data.employeeName || "—");
  row("מספר עובד", data.employeeCode || "—");
  row("תעודת זהות", data.idNumber || "—");
  row("מחלקה", data.department || "—");
  row("תפקיד", data.role || "—");
  row("תאריך תחילת עבודה", fmtDate(data.startDate));
  y -= 10;

  section("נתוני עזיבה");
  row("תאריך עזיבה", fmtDate(data.endDate));
  row("מועד הזנת תאריך העזיבה", fmtDateTime(data.endDateRecordedAt));
  row("מועד חסימת הגישה למערכת", fmtDateTime(data.accessRevokedAt));
  row("סטטוס עובד", data.status === "inactive" ? "לא פעיל" : "בעזיבה");
  y -= 10;

  section("מערכות וציוד שנותקו");
  if (!data.assets?.length) {
    drawRtlText({
      page,
      text: "לא נמצאו פריטים משויכים במועד הניתוק.",
      font: regular,
      size: 10,
      rightX: RIGHT,
      y,
      color: gray,
    });
    y -= 18;
  } else {
    // Table header
    const colName = RIGHT;
    const colCode = RIGHT - 200;
    const colCat = RIGHT - 300;
    const colAct = RIGHT - 400;
    drawRtlText({ page, text: "שם הפריט", font: bold, size: 9, rightX: colName, y, color: gray });
    drawRtlText({ page, text: "מזהה", font: bold, size: 9, rightX: colCode, y, color: gray });
    drawRtlText({ page, text: "קטגוריה", font: bold, size: 9, rightX: colCat, y, color: gray });
    drawRtlText({ page, text: "פעולה", font: bold, size: 9, rightX: colAct, y, color: gray });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    y -= 14;

    for (const a of data.assets) {
      if (y < MARGIN + 60) {
        newPage();
        y -= 4;
      }
      drawRtlText({ page, text: a.asset_name ?? "—", font: regular, size: 9.5, rightX: colName, y, color: dark });
      drawRtlText({ page, text: a.asset_code ?? "—", font: regular, size: 9.5, rightX: colCode, y, color: dark });
      drawRtlText({ page, text: a.category ?? "—", font: regular, size: 9.5, rightX: colCat, y, color: dark });
      drawRtlText({
        page,
        text: a.domain === "digital" ? "חשבון נותק" : "הוחזר למלאי",
        font: regular,
        size: 9.5,
        rightX: colAct,
        y,
        color: dark,
      });
      y -= 15;
    }
  }

  y -= 16;
  if (y < MARGIN + 90) newPage();
  const noteLines = wrapTextLines(
    "מסמך זה הופק אוטומטית ממערכת תפעול 360 לצורכי ביקורת. הנתונים משקפים את מצב השיוכים והגישות של העובד במועד ניתוקו מהמערכת.",
    regular,
    9,
    RIGHT - MARGIN
  );
  for (const line of noteLines) {
    drawRtlText({ page, text: line, font: regular, size: 9, rightX: RIGHT, y, color: gray });
    y -= 13;
  }

  y -= 28;
  if (y < MARGIN + 60) newPage();
  drawRtlText({ page, text: "חתימת מנהל/ת משאבי אנוש: ______________________", font: regular, size: 10, rightX: RIGHT, y, color: dark });
  y -= 24;
  drawRtlText({ page, text: "תאריך: ______________________", font: regular, size: 10, rightX: RIGHT, y, color: dark });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
