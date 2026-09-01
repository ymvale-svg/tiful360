/**
 * SheetJS is one of the heaviest dependencies in the bundle and is only needed
 * when someone actually reads or writes a spreadsheet — importing employees,
 * importing assets, downloading a template, or exporting a report. Keeping it
 * out of the entry chunk saves every other user the download.
 *
 * The promise is cached, so the second call in a session resolves immediately.
 */
export type XlsxModule = typeof import("xlsx");

let pending: Promise<XlsxModule> | null = null;

export function loadXlsx(): Promise<XlsxModule> {
  pending ??= import("xlsx");
  return pending;
}
