import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { SaveProgressBar } from "@/components/SaveProgressBar";
import { saveActivity, trackSave } from "@/lib/saveActivity";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

afterEach(() => { vi.useRealTimers(); });

describe("saveActivity", () => {
  it("counts each save once, even if its end is called twice", () => {
    const end = saveActivity.begin();
    expect(saveActivity.get()).toBe(1);
    end();
    end();
    expect(saveActivity.get()).toBe(0);
  });

  it("trackSave ends on failure and keeps the error", async () => {
    await expect(trackSave(Promise.reject(new Error("נכשל")))).rejects.toThrow("נכשל");
    expect(saveActivity.get()).toBe(0);
  });
});

describe("Button busy state", () => {
  it("blocks repeat clicks while an async handler runs, then re-enables", async () => {
    const d = deferred();
    const onClick = vi.fn(() => d.promise);
    render(<Button onClick={onClick}>שמירה</Button>);
    const btn = screen.getByRole("button", { name: "שמירה" }) as HTMLButtonElement;

    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(saveActivity.get()).toBe(1);

    await act(async () => { d.resolve(); await d.promise; });
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(saveActivity.get()).toBe(0);
  });

  it("re-enables after a failed handler", async () => {
    const d = deferred();
    render(<Button onClick={() => d.promise}>שליחה</Button>);
    const btn = screen.getByRole("button", { name: "שליחה" }) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(btn.disabled).toBe(true);
    await act(async () => { d.reject(new Error("x")); await d.promise.catch(() => {}); });
    expect(btn.disabled).toBe(false);
  });

  it("leaves sync handlers alone", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>פתח</Button>);
    const btn = screen.getByRole("button", { name: "פתח" }) as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(btn.getAttribute("aria-busy")).toBeNull();
  });

  it("shows loadingText when loading is set", () => {
    render(<Button loading loadingText="שומר...">שמירה</Button>);
    const btn = screen.getByRole("button", { name: "שומר..." }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });
});

describe("SaveProgressBar", () => {
  const renderBar = () =>
    render(<QueryClientProvider client={new QueryClient()}><SaveProgressBar /></QueryClientProvider>);

  it("stays hidden for saves shorter than the delay", () => {
    vi.useFakeTimers();
    renderBar();
    let end!: () => void;
    act(() => { end = saveActivity.begin(); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { end(); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows during a longer save and hides after it ends", () => {
    vi.useFakeTimers();
    renderBar();
    let end!: () => void;
    act(() => { end = saveActivity.begin(); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("progressbar", { name: "שמירת שינויים" })).toBeTruthy();
    act(() => { end(); });
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
