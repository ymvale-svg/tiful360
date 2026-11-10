import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmDialog";

const revoke = vi.fn();
const protocol = vi.fn();
const toast = vi.fn();
const held = (id: string, emp: [string, string, string], system: string, target: Record<string, unknown>, status = "active") => ({
  id, employee_id: emp[0], system_id: system, status, effective_from: "2026-11-16T06:00:00Z", executed_at: "2026-11-16T07:00:00Z",
  executed_by_name: "מנהל", external_username: null,
  employees: { full_name: emp[1], department: emp[2], status: "active" },
  system_access_systems: { name: system === "p" ? "כונן P" : "פריוריטי", owner_role: "admin", owner_user_id: null, provisioning: "manual" },
  ...target,
});
const GRANTS = [
  held("g1", ["e1", "אחמד פוקרה", "הנדסה"], "p", { system_access_groups: { name: "הנדסה", external_name: null } }),
  held("g2", ["e1", "אחמד פוקרה", "הנדסה"], "prio", { system_access_resources: { path: "רכש" } }, "revoke_requested"),
  held("g3", ["e2", "דנה לוי", "כספים"], "prio", { system_access_resources: { path: "כספים" } }),
];
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, mutateAsync: fn, isPending: false });

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const PEOPLE = [
  { id: "e1", role: "מהנדס", department: "הנדסה", status: "active" },
  { id: "e2", role: "חשבת", department: "כספים", status: "active" },
  { id: "e3", role: "מהנדס", department: "הנדסה", status: "active" },
  { id: "e4", role: "מהנדס", department: "הנדסה", status: "active" },
];
vi.mock("@/hooks/useData", () => ({ useEmployees: () => ({ data: PEOPLE }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (r: string) => r === "hr" }) }));
vi.mock("@/hooks/useSystemAccess", () => ({
  useHeldGrants: () => ({ data: GRANTS, isLoading: false, error: null, refetch: vi.fn() }),
  useAccessSystems: () => ({ data: [
    { id: "p", name: "כונן P", is_active: true },
    { id: "prio", name: "פריוריטי", is_active: true },
  ] }),
  useRequestRevocation: () => mutation(revoke),
  useGenerateAccessProtocol: () => mutation(protocol),
}));

import { MatrixTab } from "@/components/systemAccess/MatrixTab";

describe("access matrix screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revoke.mockResolvedValue({ count: 1, ticketCode: "ACC-9" });
  });

  it("shows employees against systems, with pending revocations marked", () => {
    render(<ConfirmProvider><MatrixTab /></ConfirmProvider>);
    const row = screen.getByRole("rowheader", { name: /אחמד פוקרה/ }).closest("tr")!;
    // "הנדסה" is both the department and the drive P group.
    expect(within(row).getAllByText("הנדסה")).toHaveLength(2);
    expect(within(row).getByText("(ממתין לניתוק)")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "פריוריטי" })).toBeTruthy();
  });

  it("revokes all of an employee's access after confirming", async () => {
    render(<ConfirmProvider><MatrixTab /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "ניתוק כל ההרשאות של דנה לוי" }));
    fireEvent.click(await screen.findByRole("button", { name: "פתח בקשת ניתוק" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ employeeId: "e2", grantIds: null, note: "ניתוק ממטריצת ההרשאות" }));
  });

  it("lists everyone in one system and revokes a single grant", async () => {
    render(<ConfirmProvider><MatrixTab /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "לפי מערכת" }));
    fireEvent.change(screen.getByLabelText("מערכת"), { target: { value: "prio" } });
    const rows = screen.getAllByRole("rowheader").map((h) => h.textContent);
    expect(rows).toEqual(["אחמד פוקרההנדסה", "דנה לויכספים"]);
    const dana = screen.getByRole("rowheader", { name: /דנה לוי/ }).closest("tr")!;
    fireEvent.click(within(dana).getByRole("button", { name: /נתק/ }));
    fireEvent.click(await screen.findByRole("button", { name: "פתח בקשת ניתוק" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ employeeId: "e2", grantIds: ["g3"], note: "ניתוק ממטריצת ההרשאות" }));
  });
});

describe("unusual access in the matrix", () => {
  it("marks access no peer holds and filters to it", () => {
    render(<ConfirmProvider><MatrixTab /></ConfirmProvider>);
    // e1's peers (e3, e4) hold nothing: both of e1's grants are unusual; e2 has no peers.
    expect(screen.getByRole("button", { name: /רק חריגים \(2\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /רק חריגים/ }));
    expect(screen.queryByRole("rowheader", { name: /דנה לוי/ })).toBeNull();
    expect(screen.getAllByText("(חריג לתפקיד)").length).toBe(1);
  });
});
