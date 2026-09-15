import type { HandoverFormData, ProtocolPdfData } from "@/lib/pdf/types";
import { buildHandoverPdf, buildProtocolPdf } from "@/lib/pdf/lazy";

/** New-format snapshots produced by HandoverFlow carry `direction` + `fields`. */
export function isProtocolSnapshot(snap: any): boolean {
  return !!snap && typeof snap === "object" && "direction" in snap && Array.isArray(snap.fields);
}

export function toProtocolData(snap: any, signature: string | null): ProtocolPdfData {
  return {
    direction: snap.direction ?? "handover",
    title: snap.title ?? "פרוטוקול משיכה",
    companyName: snap.company_name ?? "",
    companyLogoUrl: snap.company_logo_url ?? null,
    employeeName: snap.employee_name ?? "",
    employeeIdNumber: snap.employee_id_number ?? null,
    employeeDepartment: snap.employee_department ?? null,
    issuerName: snap.issuer_name ?? null,
    issuedAt: snap.issued_at ?? new Date().toISOString(),
    fields: snap.fields ?? [],
    bodyText: snap.body_text ?? null,
    freeText: snap.free_text ?? null,
    media: snap.media ?? [],
    employeeSignature: signature,
    issuerSignature: snap.issuer_signature ?? null,
  };
}

/** Builds the right PDF for either the legacy handover snapshot or the new protocol snapshot. */
export async function buildPdfForFormSnapshot(snap: any, signature: string | null): Promise<Blob> {
  if (isProtocolSnapshot(snap)) return buildProtocolPdf(toProtocolData(snap, signature));
  return buildHandoverPdf({ ...(snap as HandoverFormData), receiver_signature: signature });
}

/** Human-readable item name for either snapshot shape. */
export function snapshotItemLabel(snap: any): { name: string; code: string } {
  if (!snap) return { name: "", code: "" };
  const fields: any[] = Array.isArray(snap.fields) ? snap.fields : [];
  const byKey = (k: string) => fields.find((f) => f?.key === k)?.value ?? "";
  return {
    name: snap.asset_name ?? byKey("asset_name") ?? snap.title ?? "",
    code: snap.asset_code ?? byKey("asset_code") ?? "",
  };
}
