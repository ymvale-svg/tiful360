import { formatDateTimeDMY } from "@/lib/utils";
import { isProtocolSnapshot, toProtocolData } from "@/lib/pdf/formPdf";

/**
 * Mobile-friendly HTML rendering of a handover/return protocol snapshot.
 * The PDF iframe is unusable on phones, so small screens read the protocol here
 * and can still open the full PDF in a new tab.
 */
export function ProtocolPreview({ snapshot }: { snapshot: any }) {
  const data = isProtocolSnapshot(snapshot)
    ? toProtocolData(snapshot, null)
    : {
        title: "טופס מסירת ציוד",
        companyName: snapshot?.company_name ?? "",
        employeeName: snapshot?.employee_name ?? "",
        employeeDepartment: snapshot?.employee_department ?? null,
        employeeIdNumber: null,
        issuerName: null,
        issuedAt: snapshot?.date ?? new Date().toISOString(),
        fields: (snapshot?.assets ?? []).map((a: any, i: number) => ({
          key: `asset-${i}`,
          label: a.asset_code ? `${a.asset_name} (${a.asset_code})` : a.asset_name,
          value: [a.manufacturer_model, a.serial_number].filter(Boolean).join(" · "),
        })),
        bodyText: snapshot?.terms ?? null,
        freeText: snapshot?.notes ?? null,
      } as any;

  const rows: { label: string; value: string }[] = [
    { label: "עובד", value: data.employeeName || "" },
    ...(data.employeeIdNumber ? [{ label: "ת.ז.", value: String(data.employeeIdNumber) }] : []),
    ...(data.employeeDepartment ? [{ label: "מחלקה", value: String(data.employeeDepartment) }] : []),
    ...(data.issuerName ? [{ label: "נמסר על ידי", value: String(data.issuerName) }] : []),
    { label: "תאריך", value: data.issuedAt ? formatDateTimeDMY(data.issuedAt) : "" },
  ].filter((r) => r.value);

  return (
    <article dir="rtl" className="space-y-4 text-sm">
      <header className="space-y-1">
        <h2 className="text-base font-bold">{data.title}</h2>
        {data.companyName && <p className="text-muted-foreground">{data.companyName}</p>}
      </header>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-2">
            <dt className="text-muted-foreground shrink-0">{r.label}:</dt>
            <dd className="font-medium break-words">{r.value}</dd>
          </div>
        ))}
      </dl>

      {Array.isArray(data.fields) && data.fields.length > 0 && (
        <section className="rounded-lg border divide-y">
          {data.fields.map((f: any, i: number) => (
            <div key={f.key ?? i} className="flex justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium text-left break-words">{f.value || "—"}</span>
            </div>
          ))}
        </section>
      )}

      {data.bodyText && (
        <section className="rounded-lg bg-muted/50 p-3 whitespace-pre-wrap leading-6">{data.bodyText}</section>
      )}
      {data.freeText && (
        <section className="rounded-lg bg-muted/50 p-3 whitespace-pre-wrap leading-6">{data.freeText}</section>
      )}
    </article>
  );
}
