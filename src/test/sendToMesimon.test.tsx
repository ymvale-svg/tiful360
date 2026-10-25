import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { SendToMesimonButton } from "@/components/SendToMesimonButton";

const OPTIONS = {
  users: [
    { id: 1, name: "ישראל וייל", email: "israel@example.com", department: "תפעול" },
    { id: 12, name: "איציק הנדל", email: "itzik@example.com", department: "תפעול" },
  ],
  projects: [{ id: 7, name: "תוכנות" }],
  defaultProject: "מיחשוב",
  defaultDueDate: "2026-10-27",
  defaultAssigneeEmail: "Israel@example.com",
  maxFiles: 5,
  maxUploadMb: 25,
  allowedExtensions: ["pdf", "png"],
};

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SendToMesimonButton ticket={{ id: "t1", company_id: "c1", status: "open" }} />
    </QueryClientProvider>,
  );
}

describe("SendToMesimonButton", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (_name: string, { body }: { body: { action: string } }) => {
      if (body.action === "status") return { data: { available: true }, error: null };
      if (body.action === "options") return { data: OPTIONS, error: null };
      return { data: { ok: true, task_id: "5" }, error: null };
    });
  });

  it("prefills the subject's new project, the sender and the default due date, and sends the choices", async () => {
    renderButton();
    fireEvent.click(await screen.findByText("הפוך למשימה במשימון"));

    await screen.findByText("מיחשוב (פרויקט חדש)");
    screen.getByText("ישראל וייל · תפעול");
    await waitFor(() => expect((screen.getByLabelText("תאריך יעד") as HTMLInputElement).value).toBe("2026-10-27"));

    fireEvent.click(screen.getByText("צור משימה"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create-mesimon-task", expect.anything()));
    const createCall = invoke.mock.calls.find(([, a]) => a.body.action === "create");
    if (!createCall) throw new Error("No task creation request");
    const create = createCall[1].body;
    expect(create).toMatchObject({
      ticket_id: "t1",
      project_id: null, // the subject's project — Mesimon creates it
      assignee_id: 1,
      unassigned: false,
      due_date: "2026-10-27",
      files: [],
    });
  });

  it("rejects a file type Mesimon does not allow", async () => {
    const { container } = renderButton();
    fireEvent.click(await screen.findByText("הפוך למשימה במשימון"));
    await screen.findByText("הוספת קובץ");
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "virus.exe"), new File(["%PDF"], "quote.pdf")] } });
    await screen.findByText("quote.pdf");
    expect(screen.queryByText("virus.exe")).toBeNull();
  });
});
