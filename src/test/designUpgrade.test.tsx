import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { UploadProgressCenter } from "@/components/UploadProgressCenter";
import { uploadJobs } from "@/lib/uploadWithProgress";
import { fileKind, formatBytes, timeLeft } from "@/lib/uploadFormat";
import { clearRecent, pushRecent, readRecent, splitMatch, suggestTerms } from "@/lib/searchHelpers";

describe("uploadFormat", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(6.6 * 1024 * 1024)).toBe("6.6 MB");
  });

  it("estimates time left only once there is signal", () => {
    expect(timeLeft(50, 1000, 2000)).toBeNull();
    expect(timeLeft(1, 0, 10_000)).toBeNull();
    expect(timeLeft(50, 1, 40_001)).toBe("עוד 40 שניות");
    expect(timeLeft(10, 1, 20_001)).toBe("עוד 3 דקות");
    expect(timeLeft(99, 1, 100_001)).toBe("כמעט סיים");
  });

  it("detects file kinds", () => {
    expect(fileKind("a.PDF")).toBe("pdf");
    expect(fileKind("tlush.xlsx")).toBe("sheet");
    expect(fileKind("photo.heic")).toBe("image");
    expect(fileKind("noext")).toBe("other");
  });
});

describe("searchHelpers", () => {
  beforeEach(() => localStorage.clear());

  it("keeps recent hits per user, newest first, without duplicates", () => {
    const a = { id: "1", label: "דנה", group: "עובדים", to: "/employees/1" };
    const b = { id: "2", label: "מחשב", group: "ציוד", to: "/assets/2" };
    pushRecent(a, "u1");
    pushRecent(b, "u1");
    pushRecent(a, "u1");
    expect(readRecent("u1").map((h) => h.id)).toEqual(["1", "2"]);
    expect(readRecent("u2")).toEqual([]);
    clearRecent("u1");
    expect(readRecent("u1")).toEqual([]);
  });

  it("splits text around a match", () => {
    expect(splitMatch("Laptop Dell", "dell")).toEqual(["Laptop ", "Dell", ""]);
    expect(splitMatch("abc", "x")).toBeNull();
  });

  it("suggests near words for typos", () => {
    expect(suggestTerms("lapto", ["Laptop Dell", "Printer"])).toContain("laptop");
    expect(suggestTerms("zzzzzz", ["Laptop Dell"])).toEqual([]);
  });
});

describe("Button result feedback", () => {
  it("shows the success text after a resolved click, then returns", async () => {
    vi.useFakeTimers();
    render(<Button successText="נשמר" onClick={() => Promise.resolve()}>שמירה</Button>);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").getAttribute("data-outcome")).toBe("success");
    expect(screen.getByRole("status").textContent).toContain("נשמר");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("button").hasAttribute("data-outcome")).toBe(false);
    vi.useRealTimers();
  });

  it("shows the error text when the handler rejects", async () => {
    render(<Button successText="נשמר" onClick={() => Promise.reject(new Error("x"))}>שמירה</Button>);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").getAttribute("data-outcome")).toBe("error");
  });

  it("stays plain without successText", async () => {
    render(<Button onClick={() => Promise.resolve()}>שמירה</Button>);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button").hasAttribute("data-outcome")).toBe(false);
  });
});

describe("UploadProgressCenter", () => {
  it("renders a running upload with a working cancel button", () => {
    const cancel = vi.fn();
    uploadJobs.add({ id: "t1", name: "tlush.pdf", stage: "upload", percent: 40, size: 1024 * 1024, cancel });
    render(<UploadProgressCenter />);
    expect(screen.getByRole("progressbar", { name: "התקדמות tlush.pdf" }).getAttribute("aria-valuenow")).toBe("40");
    fireEvent.click(screen.getByRole("button", { name: "ביטול ההעלאה של tlush.pdf" }));
    expect(cancel).toHaveBeenCalled();
    act(() => uploadJobs.remove("t1"));
  });
});
