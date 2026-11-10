import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/onboarding", () => ({ updateCategoryOnboarding: (...a: unknown[]) => update(...a) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useData", () => ({
  useAssetCategories: () => ({
    data: [
      { id: "laptop", category_name: "מחשב נייד", domain: "physical" },
      { id: "policy", category_name: "פוליסת ביטוח", domain: "insurance" },
    ],
  }),
}));

import { OnboardingCatalogSettings } from "@/components/onboarding/OnboardingCatalogSettings";

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingCatalogSettings open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("OnboardingCatalogSettings", () => {
  beforeEach(() => update.mockReset().mockResolvedValue(undefined));

  it("shows each category's derived track and visibility", () => {
    renderDialog();
    const value = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;
    const checked = (label: string) => screen.getByLabelText(label).getAttribute("aria-checked");
    expect(value("מסלול ביצוע למחשב נייד")).toBe("equipment");
    expect(value("מסלול ביצוע לפוליסת ביטוח")).toBe("none");
    expect(checked("מחשב נייד מופיע בקליטה")).toBe("true");
    expect(checked("פוליסת ביטוח מופיע בקליטה")).toBe("false");
  });

  it("saves a new track and a visibility change for that category only", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("מסלול ביצוע למחשב נייד"), { target: { value: "task" } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({}, "laptop", { fulfillment_track: "task" }));
    fireEvent.click(screen.getByLabelText("פוליסת ביטוח מופיע בקליטה"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({}, "policy", { show_in_onboarding: true }));
  });
});
