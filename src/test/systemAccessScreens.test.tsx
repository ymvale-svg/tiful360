import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmDialog";

const saveSystem = vi.fn();
const importTree = vi.fn();
const setGroupResource = vi.fn();
const toast = vi.fn();
const createKey = vi.fn();
const revokeKey = vi.fn();
const previewImport = vi.fn();
const applyImport = vi.fn();
let scanStatus: unknown = { connected: false, last_at: null, last_result: null, agent: null };

const SYSTEM = {
  id: "p", company_id: "c1", name: "כונן P", provisioning: "manual", owner_role: "it_manager",
  owner_user_id: null, resource_label: "תיקייה", is_active: true, sort_order: 0,
};
const RESOURCES = [
  { id: "r1", system_id: "p", parent_id: null, name: "פרויקטים", path: "פרויקטים", external_ref: null, is_active: true, missing_since: null, sort_order: 0 },
  { id: "r2", system_id: "p", parent_id: "r1", name: "תכנון", path: "פרויקטים\\תכנון", external_ref: null, is_active: true, missing_since: null, sort_order: 0 },
];
const GROUPS = [
  { id: "g1", system_id: "p", name: "הנדסה", external_name: "GRP_P_Engineering", description: null, is_active: true,
    system_access_group_resources: [{ resource_id: "r1", level: "write" }] },
];
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, mutateAsync: fn, isPending: false });

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useSystemAccess", () => ({
  useAccessSystems: () => ({ data: [SYSTEM], isLoading: false, error: null, refetch: vi.fn() }),
  useSaveAccessSystem: () => mutation(saveSystem),
  useAccessResources: () => ({ data: RESOURCES, isLoading: false, error: null, refetch: vi.fn() }),
  useAddAccessResource: () => mutation(vi.fn()),
  useSetAccessResourceActive: () => mutation(vi.fn()),
  useImportAccessTree: () => mutation(importTree),
  useAccessGroups: () => ({ data: GROUPS }),
  useSaveAccessGroup: () => mutation(vi.fn()),
  useSetGroupResource: () => mutation(setGroupResource),
  useScanStatus: () => ({ data: scanStatus }),
  useScanKey: () => ({ create: mutation(createKey), revoke: mutation(revokeKey) }),
  useLegacyAccessImport: () => ({ preview: mutation(previewImport), apply: mutation(applyImport) }),
}));

import { SystemsTab } from "@/components/systemAccess/SystemsTab";
import { AccessTreeTab } from "@/components/systemAccess/AccessTreeTab";
import { treeExportCommand } from "@/domain/systemAccess/treeImport";

describe("system access screens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSystem.mockResolvedValue({ ...SYSTEM, id: "new" });
    importTree.mockResolvedValue({ added: 1, missing: 0, returned: 0, total: 3 });
  });

  it("offers the common systems that are not there yet and adds one in a click", async () => {
    render(<ConfirmProvider><SystemsTab /></ConfirmProvider>);
    const suggestions = within(screen.getByLabelText("מערכות מוצעות"));
    expect(suggestions.queryByRole("button", { name: /כונן P/ })).toBeNull();
    fireEvent.click(suggestions.getByRole("button", { name: /פריוריטי/ }));
    await waitFor(() =>
      expect(saveSystem).toHaveBeenCalledWith({ name: "פריוריטי", provisioning: "manual", owner_role: "admin", resource_label: "סביבה", sort_order: 1 }),
    );
  });

  it("shows which groups open a folder and assigns a folder to the selected group", () => {
    render(<ConfirmProvider><AccessTreeTab /></ConfirmProvider>);
    // The folder carries a tag of the group that opens it.
    const folder = screen.getByText("פרויקטים", { selector: "span" }).closest("li")!;
    expect(within(folder).getByText("הנדסה")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /הנדסה/ }));
    fireEvent.click(screen.getByRole("button", { name: "פתח פרויקטים" }));
    fireEvent.change(screen.getByLabelText("תכנון בקבוצה הנדסה"), { target: { value: "read" } });
    expect(setGroupResource).toHaveBeenCalledWith({ groupId: "g1", resourceId: "r2", level: "read" }, expect.anything());
  });

  it("imports a dropped tree export after confirming the preview", async () => {
    const { container } = render(<ConfirmProvider><AccessTreeTab /></ConfirmProvider>);
    const csv = '"FullName"\n"P:\\פרויקטים"\n"P:\\פרויקטים\\תכנון"\n"P:\\פרויקטים\\פיקוח"\n';
    const file = new File([csv], "tree.csv", { type: "text/csv" });
    // jsdom's File has no text(); browsers do.
    Object.defineProperty(file, "text", { value: async () => csv });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText(/^1 חדשות יתווספו/);
    fireEvent.click(screen.getByRole("button", { name: "ייבא" }));
    await waitFor(() => expect(importTree).toHaveBeenCalledWith(["פרויקטים", "פרויקטים\\פיקוח", "פרויקטים\\תכנון"]));
  });

  it("builds the PowerShell export line for the drive", () => {
    expect(treeExportCommand("S:\\")).toContain("-Path 'S:\\'");
    expect(treeExportCommand("")).toContain("-Path 'P:\\'");
  });
});

describe("importing existing access", () => {
  const RESULT = { applied: false, systemsCreated: 1, resourcesCreated: 2, grants: 5, employees: 3, skipped: 1,
    bySystem: { "פריוריטי": { grants: 3 }, "כונן P": { grants: 2 } } };

  it("previews per system and imports only after confirming", async () => {
    previewImport.mockResolvedValue(RESULT);
    applyImport.mockResolvedValue({ ...RESULT, applied: true });
    render(<ConfirmProvider><SystemsTab /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: /בדוק מה ייובא/ }));
    const table = await screen.findByRole("table", { name: "הרשאות לייבוא לפי מערכת" });
    expect(within(table).getByRole("rowheader", { name: "פריוריטי" })).toBeTruthy();
    expect(screen.getByText(/5 הרשאות פעילות ל-3 עובדים · 1 כבר קיימות/)).toBeTruthy();
    expect(applyImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ייבא" }));
    await waitFor(() => expect(applyImport).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "ההרשאות יובאו" })));
  });

  it("says when there is nothing new instead of asking", async () => {
    previewImport.mockResolvedValue({ ...RESULT, grants: 0, employees: 0, skipped: 4, bySystem: {} });
    render(<ConfirmProvider><SystemsTab /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: /בדוק מה ייובא/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "אין מה לייבא" })));
    expect(screen.queryByRole("button", { name: "ייבא" })).toBeNull();
    expect(applyImport).not.toHaveBeenCalled();
  });
});

describe("automatic tree scan", () => {
  it("creates a key after confirming and shows it once with the system id", async () => {
    createKey.mockResolvedValue("a".repeat(64));
    render(<ConfirmProvider><AccessTreeTab /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: /חיבור סריקה אוטומטית/ }));
    fireEvent.click(await screen.findByRole("button", { name: "צור מפתח" }));
    expect(await screen.findByText(`ACCESS_TREE_TOKEN=${"a".repeat(64)}`)).toBeTruthy();
    expect(screen.getByText("ACCESS_TREE_SYSTEM_ID=p")).toBeTruthy();
  });

  it("shows the last scan and lets IT disconnect", async () => {
    scanStatus = { connected: true, last_at: "2026-11-10T01:00:00Z", last_result: { added: 3, missing: 1, returned: 0, total: 214 }, agent: "FILESRV01" };
    revokeKey.mockResolvedValue(undefined);
    render(<ConfirmProvider><AccessTreeTab /></ConfirmProvider>);
    expect(screen.getByText(/סריקה אחרונה 10\/11\/2026 03:00 מ-FILESRV01: 3 חדשות, 1 לא נמצאו, 214 בסך הכול/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "נתק" }));
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    fireEvent.click(within(dialog).getByRole("button", { name: "נתק" }));
    await waitFor(() => expect(revokeKey).toHaveBeenCalled());
    scanStatus = { connected: false, last_at: null, last_result: null, agent: null };
  });
});
