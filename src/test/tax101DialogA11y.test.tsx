import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useTax101", () => ({ useSubmitTax101: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/generateTax101Pdf", () => ({ generateAndUploadTax101Pdf: vi.fn() }));
import { Tax101Dialog } from "@/components/Tax101Dialog";
describe("Tax101Dialog field accessibility", () => {
  it("links errors to fields and focuses the first invalid one on a failed step", async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    render(<Tax101Dialog open onOpenChange={() => {}} formId="f" taxYear={2026} employee={{ full_name: "", id_number: "" }} />);
    const first = screen.getByLabelText(/שם פרטי/);
    expect(first.getAttribute("aria-required")).toBe("true");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /הבא/ })); });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("aria-invalid")).toBe("true");
    const desc = first.getAttribute("aria-describedby")!;
    expect(document.getElementById(desc)?.textContent).toContain("שם פרטי");
    const pass = screen.getByLabelText(/מספר דרכון/);
    expect(pass.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(pass, { target: { value: "X1" } });
    expect(screen.getByLabelText(/תעודת זהות/).getAttribute("aria-invalid")).toBeNull();
  });
});
