import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmDialog";
import type { VehicleRequest } from "@/domain/vehicles/types";

const fns = {
  update: vi.fn(), draft: vi.fn(), send: vi.fn(), importFile: vi.fn(), saveQuote: vi.fn(), deleteQuote: vi.fn(), create: vi.fn(),
};
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, mutateAsync: fn, isPending: false });
let itemRequest: VehicleRequest | null = null;
const TIERS = [{ id: "t2", company_id: "c1", name: "רמה 2", level: 2, monthly_cap: 3500, allowed_models: null, description: null, is_active: true,
  vehicle_tier_roles: [{ id: "r1", role_name: "מהנדס ביצוע", department: null }] }];

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (r: string) => r === "operations" }) }));
vi.mock("@/hooks/useVehicles", () => ({
  useVehicleTiers: () => ({ data: TIERS }),
  useSuppliers: () => ({ data: [
    { id: "s1", company_id: "c1", name: "ליסינג א", kind: "leasing", email: "a@x.example", is_active: true },
    { id: "s2", company_id: "c1", name: "ליסינג ב", kind: "leasing", email: null, is_active: true },
  ] }),
  useUpdateVehicleRequest: () => mutation(fns.update),
  useDraftQuoteRequest: () => mutation(fns.draft),
  useSendQuoteRequest: () => mutation(fns.send),
  useImportQuoteFile: () => mutation(fns.importFile),
  useSaveQuote: () => mutation(fns.saveQuote),
  useDeleteQuote: () => mutation(fns.deleteQuote),
  useCreateVehicleRequest: () => mutation(fns.create),
  useItemVehicleRequest: () => ({ data: itemRequest, isLoading: false }),
}));

import { VehicleRequestDialog } from "@/components/vehicles/VehicleRequestDialog";
import { VehicleItemAction } from "@/components/vehicles/VehicleItemAction";

const quote = (id: string, supplier: string, price: number, model = "קורולה") => ({
  id, request_id: "v1", supplier_id: supplier, model, monthly_price: price, km_per_year: 20000, period_months: 36,
  delivery_date: null, includes: null, notes: null, file_path: null, extracted: null, created_at: "2026-11-10T10:00:00Z",
});
const REQUEST: VehicleRequest = {
  id: "v1", company_id: "c1", employee_id: "e1", onboarding_item_id: "i1", tier_id: "t2",
  preferences: { fuel: "היברידי", models: ["קורולה"] }, desired_date: "2026-11-16", period_months: 36, status: "quotes_requested",
  quote_subject: null, quote_body: null, requested_supplier_ids: [], quotes_requested_at: null, chosen_quote_id: null,
  ordered_at: null, delivered_at: null, created_by_name: "רכז", created_at: "2026-11-10T09:00:00Z",
  employees: { full_name: "אחמד פוקרה", role: "מהנדס ביצוע", department: "הנדסה", start_date: "2026-11-16" },
  vehicle_tiers: { name: "רמה 2", monthly_cap: 3500, allowed_models: null },
  vehicle_quotes: [quote("q1", "s1", 3600), quote("q2", "s1", 3200)],
};

describe("car request dialog", () => {
  beforeEach(() => {
    Object.values(fns).forEach((f) => f.mockReset().mockResolvedValue(undefined));
    fns.draft.mockResolvedValue({ subject: "בקשת הצעה", body: "שלום רב", source: "ai" });
    fns.send.mockResolvedValue({ sent: 1, failed: [] });
  });

  it("drafts with AI after saving the details, and sends to the picked companies after confirming", async () => {
    render(<ConfirmProvider><VehicleRequestDialog request={REQUEST} onOpenChange={() => {}} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: /נסח עם AI/ }));
    await waitFor(() => expect((screen.getByLabelText("תוכן") as HTMLTextAreaElement).value).toBe("שלום רב"));
    expect(fns.update).toHaveBeenCalledWith(expect.objectContaining({ id: "v1", patch: expect.objectContaining({ tier_id: "t2" }) }));
    const companies = within(screen.getByRole("group", { name: "חברות ליסינג" }));
    expect(companies.getAllByRole("checkbox")[1].hasAttribute("disabled")).toBe(true);
    fireEvent.click(companies.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /שלח לחברות שנבחרו/ }));
    fireEvent.click(await screen.findByRole("button", { name: "שלח" }));
    await waitFor(() => expect(fns.send).toHaveBeenCalledWith({ requestId: "v1", supplierIds: ["s1"], subject: "בקשת הצעה", body: "שלום רב" }));
  });

  it("compares quotes against the tier cap, recommends the cheapest within it, and chooses one", async () => {
    render(<ConfirmProvider><VehicleRequestDialog request={REQUEST} onOpenChange={() => {}} /></ConfirmProvider>);
    const rows = within(screen.getByRole("table", { name: "השוואת הצעות מחיר" })).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("מומלצת: הזולה בתוך התקרה")).toBeTruthy();
    expect(within(rows[1]).getByText("חורג")).toBeTruthy();
    fireEvent.click(within(rows[0]).getByRole("button", { name: "בחר" }));
    await waitFor(() => expect(fns.update).toHaveBeenCalledWith({ id: "v1", patch: { status: "chosen", chosen_quote_id: "q2" } }));
  });
});

describe("vehicle row in the onboarding checklist", () => {
  beforeEach(() => {
    Object.values(fns).forEach((f) => f.mockReset());
    itemRequest = null;
  });

  it("opens a car request with the tier the role is entitled to and HR's model", async () => {
    fns.create.mockResolvedValue({ ...REQUEST });
    render(
      <ConfirmProvider>
        <VehicleItemAction
          item={{ id: "i1", notes: "וו גרירה" }}
          process={{ company_id: "c1", employee_id: "e1", employees: { role: "מהנדס ביצוע", department: "הנדסה", start_date: "2026-11-16" } }}
          preferredModel="קורולה"
        />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /פתח בקשת רכב/ }));
    await waitFor(() =>
      expect(fns.create).toHaveBeenCalledWith({
        company_id: "c1", employee_id: "e1", onboarding_item_id: "i1", tier_id: "t2",
        preferences: { models: ["קורולה"], notes: "וו גרירה" }, desired_date: "2026-11-16",
      }),
    );
  });

  it("follows an existing request", () => {
    itemRequest = REQUEST;
    render(<ConfirmProvider><VehicleItemAction item={{ id: "i1", notes: null }} process={{ company_id: "c1", employee_id: "e1" }} /></ConfirmProvider>);
    expect(screen.getByText(/נשלחה בקשת הצעות · 2 הצעות/)).toBeTruthy();
  });
});
