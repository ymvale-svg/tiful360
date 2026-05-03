import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

/** Convert all <img> in container to data URLs to bypass CORS taint in html2canvas. */
async function inlineImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const res = await fetch(src, { mode: "cors" });
        const blob = await res.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        img.setAttribute("src", dataUrl);
        img.removeAttribute("crossorigin");
        await new Promise((res2) => {
          if ((img as HTMLImageElement).complete) return res2(null);
          img.onload = () => res2(null);
          img.onerror = () => res2(null);
        });
      } catch {
        // ignore — keep original src
      }
    }),
  );
}

/** Render the element to a PDF blob (no upload). */
export async function renderHandoverPdfBlob(el: HTMLElement): Promise<Blob> {
  await inlineImages(el);
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  let imgW = pageW;
  let imgH = pageW / ratio;
  if (imgH > pageH) {
    imgH = pageH;
    imgW = pageH * ratio;
  }
  pdf.addImage(imgData, "PNG", (pageW - imgW) / 2, 0, imgW, imgH);
  return pdf.output("blob");
}

/** Authenticated path: upload directly via storage policy. */
export async function generateAndUploadHandoverPdf(
  el: HTMLElement,
  path: string,
): Promise<string> {
  const blob = await renderHandoverPdfBlob(el);
  const { error } = await supabase.storage
    .from("handover-forms")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("handover-forms").getPublicUrl(path);
  return data.publicUrl;
}
