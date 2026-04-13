import * as XLSX from "xlsx";

export function exportToExcel(data: Record<string, any>[], headers: { key: string; label: string }[], fileName: string) {
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
