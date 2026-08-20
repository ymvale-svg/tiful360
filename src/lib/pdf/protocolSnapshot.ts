import type { ProtocolPdfData } from "./types";

export function isProtocolSnapshot(snapshot: unknown): snapshot is Record<string, any> {
  return !!snapshot
    && typeof snapshot === "object"
    && "direction" in snapshot
    && Array.isArray((snapshot as Record<string, any>).fields);
}

export function protocolDataFromSnapshot(snapshot: Record<string, any>): ProtocolPdfData {
  return {
    direction: snapshot.direction ?? "handover",
    title: snapshot.title ?? "פרוטוקול משיכה",
    companyName: snapshot.company_name ?? "",
    companyLogoUrl: snapshot.company_logo_url ?? null,
    employeeName: snapshot.employee_name ?? "",
    employeeIdNumber: snapshot.employee_id_number ?? null,
    employeeDepartment: snapshot.employee_department ?? null,
    issuerName: snapshot.issuer_name ?? null,
    issuedAt: snapshot.issued_at ?? new Date().toISOString(),
    fields: snapshot.fields ?? [],
    bodyText: snapshot.body_text ?? null,
    freeText: snapshot.free_text ?? null,
    media: snapshot.media ?? [],
    employeeSignature: snapshot.employee_signature ?? snapshot.receiver_signature ?? null,
    issuerSignature: snapshot.issuer_signature ?? null,
  };
}