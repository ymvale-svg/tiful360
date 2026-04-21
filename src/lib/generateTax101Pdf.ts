import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

/**
 * Generates a styled PDF from a rendered HTML element (the form preview),
 * uploads to the tax-forms-101 bucket, and returns the URL.
 *
 * We render the filled-in form as a clean branded document. The original
 * source data is preserved in form_data (jsonb) for any future reprocessing
 * onto the official template.
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
    // Multi-page: slice the canvas vertically
    let renderedHeight = 0;
    const pageCanvasHeight = (pageH * canvas.width) / pageW;
    while (renderedHeight < canvas.height) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(pageCanvasHeight, canvas.height - renderedHeight);
      const ctx = slice.getContext("2d")!;
      ctx.drawImage(
        canvas,
        0, renderedHeight, canvas.width, slice.height,
        0, 0, canvas.width, slice.height,
      );
      const sliceImg = slice.toDataURL("image/png");
      const sliceImgH = (slice.height * pageW) / canvas.width;
      if (renderedHeight > 0) pdf.addPage();
      pdf.addImage(sliceImg, "PNG", 0, 0, imgW, sliceImgH);
      renderedHeight += slice.height;
    }
  }

  const blob = pdf.output("blob");

  const { error } = await supabase.storage
    .from("tax-forms-101")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("tax-forms-101").getPublicUrl(path);
  return data.publicUrl;
}
