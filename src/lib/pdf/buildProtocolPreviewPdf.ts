import { PDFDocument, rgb } from "pdf-lib";
import {
  createHebrewDoc,
  drawRtlText,
  drawCenteredRtlText,
  embedLogo,
  wrapTextLines,
} from "./hebrewPdf";

interface BuildProtocolPdfInput {
  title: string;
  bodyText: string;
  companyName?: string;
  logoUrl?: string | null;
  footerNote?: string;
}

/** Builds a standalone A4 PDF for a protocol body, with company logo header. */
export async function buildProtocolPreviewPdf(
  input: BuildProtocolPdfInput
): Promise<Blob> {
  const { pdf, regular, bold } = await createHebrewDoc();
  const page = pdf.addPage([595, 842]); // A4
  const W = 595;
  const H = 842;
  const MARGIN_R = 545;
  const MARGIN_L = 50;
  const CONTENT_W = MARGIN_R - MARGIN_L;

  let y = H - 50;

  // Logo (top-right)
  const logo = await embedLogo(pdf, input.logoUrl ?? null);
  if (logo) {
    const maxH = 50;
    const ratio = logo.width / logo.height;
    const h = maxH;
    const w = h * ratio;
    page.drawImage(logo, {
      x: MARGIN_R - w,
      y: y - h,
      width: w,
      height: h,
    });
  }

  // Company name (top-left side, under logo line)
  if (input.companyName) {
    drawRtlText({
      page,
      text: input.companyName,
      font: bold,
      size: 12,
      rightX: logo ? MARGIN_R - 110 : MARGIN_R,
      y: y - 25,
      color: { r: 0.3, g: 0.3, b: 0.3 },
    });
  }

  y -= 80;

  // Divider
  page.drawLine({
    start: { x: MARGIN_L, y },
    end: { x: MARGIN_R, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 30;

  // Title
  drawCenteredRtlText({
    page,
    text: input.title,
    font: bold,
    size: 18,
    centerX: W / 2,
    y,
  });
  y -= 35;

  // Body — wrap each paragraph
  const paragraphs = input.bodyText.split(/\n+/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      y -= 10;
      continue;
    }
    const lines = wrapTextLines(para, regular, 11, CONTENT_W);
    for (const line of lines) {
      if (y < 100) {
        // new page
        const p2 = pdf.addPage([W, H]);
        y = H - 60;
        drawRtlTextOn(p2, line, regular, 11, MARGIN_R, y);
        y -= 18;
        continue;
      }
      drawRtlText({
        page,
        text: line,
        font: regular,
        size: 11,
        rightX: MARGIN_R,
        y,
      });
      y -= 18;
    }
    y -= 6;
  }

  // Footer
  if (input.footerNote) {
    drawCenteredRtlText({
      page,
      text: input.footerNote,
      font: regular,
      size: 8,
      centerX: W / 2,
      y: 30,
      color: { r: 0.5, g: 0.5, b: 0.5 },
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function drawRtlTextOn(page: any, text: string, font: any, size: number, rightX: number, y: number) {
  drawRtlText({ page, text, font, size, rightX, y });
}
