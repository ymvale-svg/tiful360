import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

export async function generateAndUploadHandoverPdf(
  el: HTMLElement,
  path: string,
): Promise<string> {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
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
  const blob = pdf.output("blob");

  const { error } = await supabase.storage
    .from("handover-forms")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("handover-forms").getPublicUrl(path);
  return data.publicUrl;
}
