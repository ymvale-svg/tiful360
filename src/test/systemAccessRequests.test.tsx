import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmDialog";
import type { AccessRequest } from "@/domain/systemAccess/types";

const dispatch = vi.fn();
const resolve = vi.fn();
const provision = vi.fn();
let auth = { user: { id: "manager" }, roles: ["admin"] as string[] };

const grant = (id: string, system: string, ownerRole: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, company_id: "c1", request_id: "r1", employee_id: "e1", system_id: system, group_id: null, resource_id: null, status,
  effective_from: "2026-11-16T06:00:00Z", executed_at: null, executed_by_name: null, external_username: null,
  dispatch_ticket_id: null, rejection_reason: null, note: null, created_at: `2026-11-10T09:0${id.slice(-1)}:00Z`,
  system_access_systems: { name: system, owner_role: ownerRole, owner_user_id: null, provisioning: "manual" },
  ...extra,
});
const REQUEST = {
  id: "r1", company_id: "c1", employee_id: "e1", kind: "grant", status: "open", requested_by_name: "דנה",
  requested_at: "2026-11-10T09:00:00Z", note: null, onboarding_process_id: "p1", hub_ticket_id: "t1", completed_at: null,
  employees: { full_name: "אחמד פוקרה", employee_code: "E-1", role: "מהנדס ביצוע", department: "הנדסה", start_date: "2026-11-16", email: null },
  system_access_grants: [
    grant("g1", "כונן P", "it_manager", "requested", { system_access_groups: { name: "הנדסה", external_name: "GRP_P_Engineering" } }),
    grant("g2", "פריוריטי", "admin", "requested", { system_access_resources: { path: "כספים" } }),
    grant("g3", "ויפלנס", "it_manager", "dispatched"),
  ],
} as unknown as AccessRequest;

const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, mutateAsync: fn, isPending: false });
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...auth, hasRole: (r: string) => auth.roles.includes(r) }),
}));
vi.mock("@/hooks/useData", () => ({ useEmployees: () => ({ data: [] }) }));
vi.mock("@/hooks/useSystemAccess", () => ({
  useAccessRequests: () => ({ data: [REQUEST], isLoading: false, error: null, refetch: vi.fn() }),
  useDispatchAccess: () => mutation(dispatch),
  useResolveGrant: () => mutation(resolve),
  useProvisionTiful360: () => mutation(provision),
  useRequestAccess: () => mutation(vi.fn()),
  useAccessSystems: () => ({ data: [] }),
  useAccessPickerCatalog: () => ({ data: { groups: [], resources: [] } }),
}));

import { RequestsTab } from "@/components/systemAccess/RequestsTab";

const row = (label: string) => screen.getByRole("rowheader", { name: new RegExp(label) }).closest("tr")!;

describe("access requests hub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatch.mockResolvedValue([{ ticketId: "t2", ticketCode: "ACC-2", ownerRole: "it_manager", count: 1 }]);
    resolve.mockResolvedValue(undefined);
  });

  it("lets the manager send drive P to IT", async () => {
    auth = { user: { id: "manager" }, roles: ["admin"] };
    render(<ConfirmProvider><RequestsTab /></ConfirmProvider>);
    expect(screen.getByText("אחמד פוקרה")).toBeTruthy();
    fireEvent.click(within(row("כונן P")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /שלח לאחראי \(1\)/ }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ grantIds: ["g1"], note: "" }));
  });

  it("lets the manager mark his own system done with the external user name", async () => {
    auth = { user: { id: "manager" }, roles: ["admin"] };
    render(<ConfirmProvider><RequestsTab /></ConfirmProvider>);
    fireEvent.click(within(row("פריוריטי")).getByRole("button", { name: "בוצע" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/שם המשתמש/), { target: { value: "ahmad.f" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "סימון כבוצע" }));
    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith({ grantId: "g2", action: "done", executedAt: null, externalUsername: "ahmad.f", note: "" }),
    );
  });

  it("shows IT only what was sent to IT, and returning needs a reason", async () => {
    auth = { user: { id: "it" }, roles: ["it_manager"] };
    render(<ConfirmProvider><RequestsTab /></ConfirmProvider>);
    expect(within(row("כונן P")).queryByRole("checkbox")).toBeNull();
    expect(within(row("כונן P")).queryByRole("button", { name: "בוצע" })).toBeNull();
    fireEvent.click(within(row("ויפלנס")).getByRole("button", { name: "החזר" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "החזרה למנהל ההרשאות" }));
    expect(await within(dialog).findByText("נדרש הסבר")).toBeTruthy();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("automatic Tiful360 user", () => {
  it("offers 'open user' instead of 'done' on a Tiful360 grant and runs it", async () => {
    auth = { user: { id: "manager" }, roles: ["admin"] };
    REQUEST.system_access_grants.push(
      grant("g4", "תפעול 360", "admin", "requested", {
        system_access_systems: { name: "תפעול 360", owner_role: "admin", owner_user_id: null, provisioning: "auto_tiful360" },
      }) as unknown as AccessRequest["system_access_grants"][number],
    );
    provision.mockResolvedValue("ahmad@example.com");
    render(<ConfirmProvider><RequestsTab /></ConfirmProvider>);
    const r = row("תפעול 360");
    expect(within(r).queryByRole("button", { name: "בוצע" })).toBeNull();
    fireEvent.click(within(r).getByRole("button", { name: "פתח משתמש" }));
    await waitFor(() =>
      expect(provision).toHaveBeenCalledWith({ grantId: "g4", employee: { id: "e1", email: null, full_name: "אחמד פוקרה" } }),
    );
  });
});

describe("revocation requests", () => {
  it("shows a revoke request with its due time, no reject, and 'revoked' as the done action", async () => {
    auth = { user: { id: "manager" }, roles: ["admin"] };
    REQUEST.kind = "revoke";
    REQUEST.system_access_grants = [
      grant("g5", "פריוריטי", "admin", "revoke_requested", { revoke_due_at: "2026-11-30T15:00:00Z" }) as unknown as AccessRequest["system_access_grants"][number],
    ];
    render(<ConfirmProvider><RequestsTab /></ConfirmProvider>);
    expect(screen.getByText("ניתוק")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "לנתק עד" })).toBeTruthy();
    const r = row("פריוריטי");
    expect(within(r).queryByRole("button", { name: "דחה" })).toBeNull();
    fireEvent.click(within(r).getByRole("button", { name: "נותק" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/שם המשתמש/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "סימון כנותק" }));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ grantId: "g5", action: "done" })));
    expect(screen.getByRole("button", { name: /שלח לאחראי לניתוק/ })).toBeTruthy();
  });
});
