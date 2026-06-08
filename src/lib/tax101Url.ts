import { supabase } from "@/integrations/supabase/client";

/**
 * Extract the storage object path (within the `tax-forms-101` bucket) from a
 * stored `pdf_url` value. Historical rows may contain a full public URL like
 * `https://<project>.supabase.co/storage/v1/object/public/tax-forms-101/<path>`,
 * while newer rows store only the path.
 */
export function tax101PathFromUrl(value: string): string {
  const marker = "/tax-forms-101/";
  const idx = value.indexOf(marker);
  return idx >= 0 ? value.slice(idx + marker.length) : value;
}

/** Create a short-lived signed URL for a tax-form-101 PDF. */
export async function getTax101SignedUrl(pdfUrlOrPath: string): Promise<string> {
  const path = tax101PathFromUrl(pdfUrlOrPath);
  const { data, error } = await supabase.storage
    .from("tax-forms-101")
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Open a tax-form-101 PDF in a new tab via a freshly-signed URL. */
export async function openTax101Pdf(pdfUrlOrPath: string): Promise<void> {
  const url = await getTax101SignedUrl(pdfUrlOrPath);
  window.open(url, "_blank", "noopener,noreferrer");
}
