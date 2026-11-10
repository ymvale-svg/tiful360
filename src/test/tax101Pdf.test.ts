// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildTax101Pdf } from "@/lib/pdf/buildTax101Pdf";
import { TAX101_FIELDS, TAX101_PAGE_HEIGHT, TAX101_PAGE_WIDTH, fieldBounds } from "@/lib/tax101/layout";
import { emptyTax101Form, mergeTax101Form, type Tax101FormData } from "@/lib/tax101/types";

// Fonts and the template are fetched from Vite asset URLs; serve them from the repo instead.
vi.stubGlobal("fetch", async (url: string) => {
  const buf = readFileSync(resolve(process.cwd(), `.${String(url)}`));
  return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
});

// 1×1 transparent PNG
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function sampleForm(): Tax101FormData {
  return mergeTax101Form(emptyTax101Form(), {
    employer: { name: "חברה לדוגמה בע\"מ", address: "הברזל 10, תל אביב", phone: "03-1234567", tax_file_number: "912345678" },
    first_name: "ישראל",
    last_name: "ישראלי",
    id_number: "123456782",
    gender: "male",
    birth_date: "1985-04-12",
    street: "הרצל",
    house_number: "12",
    city: "רמת גן",
    postal_code: "5252012",
    marital_status: "married",
    kibbutz_member: "no",
    health_fund_name: "מכבי",
    email: "employee@example.com",
    phone: "03-7654321",
    mobile_phone: "050-1234567",
    dependents: [
      { full_name: "נועה", id_number: "234567891", birth_date: "2015-06-01", is_in_custody: true, receives_allowance: true },
      { full_name: "דניאל", id_number: "", birth_date: "2020-02-20", is_in_custody: true, receives_allowance: false },
    ],
    income_type: "monthly",
    job_start_date: "2026-01-01",
    has_other_income: true,
    other_income_types: { partial: true },
    other_income_credits: "receive_elsewhere",
    spouse_first_name: "שרה",
    spouse_last_name: "ישראלי",
    spouse_id: "345678912",
    spouse_birth_date: "1987-09-30",
    spouse_income_status: "has_income",
    spouse_income_sources: { work: true },
    year_changes: [{ change_date: "2026-05-01", details: "מעבר דירה לחיפה", notification_date: "2026-05-04" }],
    tax_credits: {
      israeli_resident: true,
      children_in_custody: true,
      children_in_custody_age_6_to_17: 1,
      children_in_custody_age_4_to_5: 1,
      discharged_soldier: true,
      discharged_soldier_service_start_date: "2021-08-01",
      discharged_soldier_service_end_date: "2024-08-01",
      reservist_combat: true,
      reservist_combat_days: 45,
    },
    tax_coordination: {
      has_additional_employers: true,
      additional_employers: [
        { employer_name: "מעסיק ב׳", employer_address: "יפו 1, ירושלים", tax_file_number: "934567890", income_type: "עבודה", monthly_gross: 4500, tax_withheld: 320 },
      ],
    },
  });
}

describe("Form 101 field map", () => {
  it("keeps every field inside the A4 page", () => {
    for (const f of TAX101_FIELDS) {
      const b = fieldBounds(f);
      expect(b.x0, f.id).toBeGreaterThanOrEqual(0);
      expect(b.x1, f.id).toBeLessThanOrEqual(TAX101_PAGE_WIDTH);
      expect(b.top, f.id).toBeGreaterThanOrEqual(0);
      expect(b.bottom, f.id).toBeLessThanOrEqual(TAX101_PAGE_HEIGHT);
    }
  });

  it("uses unique field ids", () => {
    const ids = TAX101_FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Form 101 PDF", () => {
  it("fills the two-page official template", async () => {
    const blob = await buildTax101Pdf({ data: sampleForm(), taxYear: 2026, signatureDataUrl: SIGNATURE, signedAt: new Date(2026, 0, 5) });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    if (process.env.TAX101_PDF_OUT) writeFileSync(process.env.TAX101_PDF_OUT, bytes);
  });

  it("builds an empty, unsigned form", async () => {
    const blob = await buildTax101Pdf({ data: emptyTax101Form(), taxYear: 2026 });
    expect(blob.size).toBeGreaterThan(1000);
  });
});
