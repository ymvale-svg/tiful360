// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadXlsx } from "@/lib/xlsx";
import { exportToExcel } from "@/lib/exportExcel";

describe("spreadsheet compatibility across all import and report screens", () => {
  it("uses patched SheetJS and caches its lazy load", async () => {
    const first = loadXlsx();
    expect(loadXlsx()).toBe(first);
    expect((await first).version).toBe("0.20.3");
  });
  it.each(["xlsx", "biff8", "csv"] as const)("round-trips Hebrew, IDs and dates in %s", async (bookType) => {
    const xlsx = await loadXlsx();
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
      ["שם מלא", "תעודת זהות", "תאריך התחלה"], ["ישראל ישראלי", "001234567", 46031],
    ]), "עובדים");
    const bytes = xlsx.write(wb, { type: "buffer", bookType });
    const read = xlsx.read(new Uint8Array(bytes), { type: "array" });
    const rows = xlsx.utils.sheet_to_json(read.Sheets[read.SheetNames[0]]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ "שם מלא": "ישראל ישראלי" });
    if (bookType !== "csv") expect(rows[0]).toMatchObject({ "תעודת זהות": "001234567", "תאריך התחלה": 46031 });
    expect(xlsx.SSF.parse_date_code(46031)).toMatchObject({ y: 2026, m: 1, d: 9 });
  });
  it.each(["עובדים", "משתמשים", "ציוד", "קריאות שירות", "חברות", "מנויי רכב", "תיקוני נוכחות", "חופשות", "התראות", "לוג הרשאות", "תמונת מצב הרשאות", "חוסרי נוכחות", "דוח נוכחות יומי", "דוח נוכחות חודשי"])("exports %s with ordered columns and RTL", async (report) => {
    const xlsx = await loadXlsx();
    const write = vi.spyOn(xlsx, "writeFile").mockImplementation(() => {});
    await exportToExcel([{ name: "נתון בדיקה", code: "000123", notes: null, ignored: "not exported" }], [
      { key: "code", label: "מזהה" }, { key: "name", label: "שם" }, { key: "notes", label: "הערות" },
    ], report);
    const [wb, filename] = write.mock.calls[0];
    expect(filename).toBe(`${report}.xlsx`);
    expect(wb.Workbook?.Views?.[0].RTL).toBe(true);
    const bytes = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const roundTrip = xlsx.read(bytes, { type: "buffer" });
    expect(xlsx.utils.sheet_to_json(roundTrip.Sheets[roundTrip.SheetNames[0]], { header: 1 })).toEqual([
      ["מזהה", "שם", "הערות"], ["000123", "נתון בדיקה", ""],
    ]);
    write.mockRestore();
  });
  it("exports empty data and caps widths for long values", async () => {
    const xlsx = await loadXlsx();
    const write = vi.spyOn(xlsx, "writeFile").mockImplementation(() => {});
    await exportToExcel([], [{ key: "name", label: "שם" }], "ריק");
    expect(write.mock.calls[0][0].SheetNames).toEqual(["גיליון1"]);
    await exportToExcel([{ name: "א".repeat(500) }], [{ key: "name", label: "שם" }], "ארוך");
    expect(write.mock.calls[1][0].Sheets["גיליון1"]["!cols"]?.[0].wch).toBe(40);
    write.mockRestore();
  });
});