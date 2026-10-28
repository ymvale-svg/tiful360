import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "@/components/feedback/ConfirmDialog";
import { FormField } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { FileDrop } from "@/components/feedback/FileDrop";
import { runBatch } from "@/lib/batchProgress";
import { uploadJobs } from "@/lib/uploadWithProgress";
import { daysUntil, groupAlerts, relativeDay } from "@/lib/alertGroups";

function Asker({ opts, onResult }: { opts: ConfirmOptions; onResult: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return <button onClick={async () => onResult(await confirm(opts))}>שאל</button>;
}

const ask = (opts: ConfirmOptions, onResult = vi.fn()) => {
  render(<ConfirmProvider><Asker opts={opts} onResult={onResult} /></ConfirmProvider>);
  fireEvent.click(screen.getByText("שאל"));
  return onResult;
};

describe("ConfirmDialog", () => {
  it("resolves true on confirm and false on cancel", async () => {
    const yes = ask({ title: "למחוק?", confirmLabel: "מחק" });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "מחק" })); });
    expect(yes).toHaveBeenCalledWith(true);
  });

  it("keeps the confirm button disabled until the required text is typed", async () => {
    ask({ title: "מחיקת חברה", confirmLabel: "מחק", requireText: "אשל בע\"מ" });
    const btn = (await screen.findByRole("button", { name: "מחק" })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "אשל בע\"מ" } });
    expect(btn.disabled).toBe(false);
  });

  it("stays open and shows the error when the action fails", async () => {
    const result = ask({ title: "שמירה", confirmLabel: "אשר", onConfirm: () => Promise.reject(new Error("אין הרשאה")) });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "אשר" })); });
    expect((await screen.findByRole("alert")).textContent).toContain("אין הרשאה");
    expect(result).not.toHaveBeenCalled();
  });
});

describe("FormField", () => {
  it("links label, hint and error to the control", () => {
    render(<FormField label="אימייל" hint="לדוגמה name@company.co.il" error="כתובת לא תקינה"><input /></FormField>);
    const input = screen.getByLabelText("אימייל");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(["לדוגמה name@company.co.il", "כתובת לא תקינה"]);
  });
});

describe("StateView", () => {
  it("shows loading before error, and error before empty", () => {
    const { rerender } = render(<StateView loading error="x" isEmpty empty={{ title: "ריק" }} label="קריאות"><p>תוכן</p></StateView>);
    expect(screen.getByRole("status").textContent).toContain("טוען קריאות");
    rerender(<StateView error="x" isEmpty empty={{ title: "ריק" }} label="קריאות"><p>תוכן</p></StateView>);
    expect(screen.getByRole("alert").textContent).toContain("לא הצלחנו לטעון קריאות");
    rerender(<StateView isEmpty empty={{ title: "ריק" }}><p>תוכן</p></StateView>);
    expect(screen.getByText("ריק")).toBeTruthy();
    rerender(<StateView><p>תוכן</p></StateView>);
    expect(screen.getByText("תוכן")).toBeTruthy();
  });
});

describe("FileDrop", () => {
  it("accepts dropped files of the right type and reports the rest", () => {
    const onFiles = vi.fn();
    const { container } = render(<FileDrop onFiles={onFiles} accept=".pdf" multiple />);
    const pdf = new File(["a"], "תלוש.pdf", { type: "application/pdf" });
    const png = new File(["b"], "צילום.png", { type: "image/png" });
    fireEvent.drop(container.querySelector("label")!, { dataTransfer: { files: [pdf, png] } });
    expect(onFiles).toHaveBeenCalledWith([pdf]);
    expect(screen.getByRole("alert").textContent).toContain("אינו נתמך");
  });
});

describe("runBatch", () => {
  it("runs every item, collects failures and leaves a summary card", async () => {
    const res = await runBatch([1, 2, 3], async (n) => { if (n === 2) throw new Error("כפילות"); }, { name: "ייבוא" });
    expect(res.done).toBe(2);
    expect(res.failed).toEqual([{ item: 2, index: 1, error: "כפילות" }]);
    const job = uploadJobs.get().find((j) => j.name === "ייבוא");
    expect(job?.stage).toBe("error");
    expect(job?.error).toBe("2 מתוך 3 הושלמו, 1 נכשלו");
    uploadJobs.remove(job!.id);
  });
});

describe("alert grouping", () => {
  const now = new Date(2026, 9, 28);
  it("counts whole days and words them", () => {
    expect(daysUntil("2026-10-28", now)).toBe(0);
    expect(daysUntil("2026-11-06", now)).toBe(9);
    expect(relativeDay(-3)).toBe("לפני 3 ימים");
    expect(relativeDay(1)).toBe("מחר");
  });
  it("orders groups by urgency and items by severity", () => {
    const groups = groupAlerts([
      { id: "a", severity: "info", target_date: "2026-11-01" },
      { id: "b", severity: "critical", target_date: "2026-11-02" },
      { id: "c", severity: "warning", target_date: "2026-10-20" },
      { id: "d", severity: "warning", target_date: null },
      { id: "e", severity: "info", target_date: "2027-01-01" },
    ], now);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "week", "later", "undated"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
