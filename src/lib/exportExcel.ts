import { loadXlsx } from "@/lib/xlsx";

// xlsx is one of the heaviest dependencies in the app and is only needed the
// moment someone actually exports. Loaded on demand so it stays out of the
// entry chunk. Callers invoke this from click handlers and ignore the result,
// so returning a promise costs them nothing.
export async function exportToExcel(data: Record<string, any>[], headers: { key: string; label: string }[], fileName: string) {
  const XLSX = await loadXlsx();

  const rows = data.map((row) =>
    headers.reduce((acc, h) => {
      acc[h.label] = row[h.key] ?? "";
      return acc;
    }, {} as Record<string, any>)
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto column widths
  const colWidths = headers.map((h) => {
    const maxLen = Math.max(h.label.length, ...data.map((r) => String(r[h.key] ?? "").length));
    return { wch: Math.min(maxLen + 4, 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "גיליון1");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
