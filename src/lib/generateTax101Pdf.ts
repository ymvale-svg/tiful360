import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

/**
 * Generates a styled PDF from a rendered HTML element (the form preview),
 * uploads to the tax-forms-101 bucket, and returns the URL.
 *
 * Multi-page output: instead of slicing at fixed pixel rows (which cuts
 * sections, tables and field rows in half), we look for the nearest "white"
 * (mostly-blank) horizontal row above the ideal page break and snap the
 * slice there. This keeps section headers, table rows and checkboxes
 * intact across pages, matching the official 0101/130 layout.
 */
export async function generateAndUploadTax101Pdf(
  el: HTMLElement,
  path: string,
): Promise<string> {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgW = pageW;
  const imgH = (canvas.height * pageW) / canvas.width;

  if (imgH <= pageH) {
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
  } else {
    const idealPageCanvasH = (pageH * canvas.width) / pageW;
    const ctxSrc = canvas.getContext("2d", { willReadFrequently: true })!;
    const totalH = canvas.height;

    // Sample white-rows in the source canvas, used to find clean break points.
    const isRowMostlyWhite = (y: number): boolean => {
      // Sample 20 evenly-spaced pixels across the row; treat as white if all bright.
      try {
        const samples = 20;
        const step = Math.max(1, Math.floor(canvas.width / samples));
        const data = ctxSrc.getImageData(0, y, canvas.width, 1).data;
        let nonWhite = 0;
        for (let x = 0; x < canvas.width; x += step) {
          const i = x * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r < 245 || g < 245 || b < 245) {
            nonWhite++;
            if (nonWhite > 1) return false; // tolerate tiny anti-alias noise
          }
        }
        return true;
      } catch {
        return true;
      }
    };

    // Look up to 15% of a page upwards from the ideal break to find a safe row.
    const findSafeBreak = (idealY: number): number => {
      const minY = Math.max(0, idealY - Math.floor(idealPageCanvasH * 0.15));
      // Prefer a contiguous white band of at least 4px (so we don't break inside a thin border).
      for (let y = idealY; y >= minY; y--) {
        let band = 0;
        for (let k = 0; k < 4 && y - k >= 0; k++) {
          if (isRowMostlyWhite(y - k)) band++;
          else break;
        }
        if (band >= 4) return y;
      }
      return idealY;
    };

    let renderedHeight = 0;
    let pageIndex = 0;
    while (renderedHeight < totalH) {
      const remaining = totalH - renderedHeight;
      let sliceH: number;
      if (remaining <= idealPageCanvasH) {
        sliceH = remaining;
      } else {
        const ideal = renderedHeight + idealPageCanvasH;
        const safe = findSafeBreak(ideal);
        sliceH = Math.max(50, safe - renderedHeight); // never produce an empty page
      }

      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0, renderedHeight, canvas.width, sliceH,
        0, 0, canvas.width, sliceH,
      );
      const sliceImg = slice.toDataURL("image/png");
      const sliceImgH = (sliceH * pageW) / canvas.width;
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(sliceImg, "PNG", 0, 0, imgW, sliceImgH);
      renderedHeight += sliceH;
      pageIndex++;
    }
  }

  const blob = pdf.output("blob");

  const { error } = await supabase.storage
    .from("tax-forms-101")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;

  // Store the storage path; consumers fetch a short-lived signed URL on demand.
  return path;
}
