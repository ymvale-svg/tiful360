import { generateAndUploadHandoverPdf } from "./generateHandoverPdf";

/**
 * Generates a PDF of the offboarding asset-return form and uploads it
 * to the existing `handover-forms` bucket under an `offboarding/` prefix.
 * Returns the public URL.
 */
export async function generateAndUploadOffboardingPdf(
  el: HTMLElement,
  companyId: string,
  employeeId: string,
  formId: string,
): Promise<string> {
  const path = `offboarding/${companyId}/${employeeId}/${formId}-${Date.now()}.pdf`;
  return generateAndUploadHandoverPdf(el, path);
}
