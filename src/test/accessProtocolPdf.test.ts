// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildAccessProtocolPdf } from "@/lib/pdf/buildAccessProtocolPdf";

// The Hebrew fonts are fetched from Vite asset URLs; serve them from the repo instead.
vi.stubGlobal("fetch", async (url: string) => {
  const buf = readFileSync(resolve(process.cwd(), `.${String(url)}`));
  return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
});

const row = (i: number) => ({
  system: i % 2 ? "כונן P" : "פריוריטי", target: `הרשאה ${i}`, externalGroup: null, status: "נפתח", requestedBy: "דנה",
  effectiveFrom: "2026-11-16T06:00:00Z", openedAt: "2026-11-16T07:00:00Z", openedBy: "מנהל", username: null, revokedAt: null, revokedBy: null,
});
const input = (rows: ReturnType<typeof row>[]) => ({
  documentId: "ACC-P-1A2B3C4D-20261110", companyName: "חברה", generatedBy: "מנהל", employeeName: "אחמד פוקרה",
  employeeCode: null, role: null, department: null, startDate: "2026-11-16", endDate: null, rows,
});

describe("access protocol PDF", () => {
  it("builds a PDF, also for an employee without access", async () => {
    const empty = await buildAccessProtocolPdf(input([]));
    expect(empty.type).toBe("application/pdf");
    const head = new TextDecoder().decode(new Uint8Array(await empty.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
  });

  it("continues on new pages when the history is long", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await buildAccessProtocolPdf(input(Array.from({ length: 80 }, (_, i) => row(i))));
    const doc = await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
