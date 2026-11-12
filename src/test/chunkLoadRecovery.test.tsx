import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";

const reload = vi.fn();
Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });

beforeEach(() => {
  vi.resetModules();
  reload.mockClear();
  sessionStorage.clear();
});

async function load() {
  const lazyMod = await import("@/lib/lazyWithReload");
  const { RouteErrorBoundary } = await import("@/components/RouteErrorBoundary");
  return { ...lazyMod, RouteErrorBoundary };
}

describe("stale chunk recovery", () => {
  it("reloads once for a failed chunk, then refuses within 30 seconds", async () => {
    const { reloadOnceForStaleChunk } = await load();
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.resetModules();
    const fresh = await load(); // new page load, same tab
    expect(fresh.reloadOnceForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows a refresh message instead of a blank screen when a screen's file resolves empty after a reload was tried", async () => {
    sessionStorage.setItem("lazy-reload-at", String(Date.now()));
    const { lazyWithReload, RouteErrorBoundary } = await load();
    const Broken = lazyWithReload(() => Promise.resolve(undefined as never));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Suspense fallback={null}><Broken /></Suspense>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    expect(await screen.findByText("המסך לא נטען")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
