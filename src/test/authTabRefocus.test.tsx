import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";

type Listener = (event: string, session: unknown) => void;
const auth = vi.hoisted(() => ({ listener: null as null | ((event: string, session: unknown) => void) }));

const session = (id: string) => ({ access_token: `t-${Math.random()}`, user: { id, updated_at: "2026-01-01" } });

vi.mock("@/integrations/supabase/client", () => {
  const rolesQuery = { select: () => rolesQuery, eq: () => Promise.resolve({ data: [{ role: "admin" }], error: null }) };
  return {
    supabase: {
      auth: {
        onAuthStateChange: (cb: Listener) => {
          auth.listener = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        getSession: () => Promise.resolve({ data: { session: session("u1") } }),
        signOut: () => Promise.resolve(),
      },
      from: () => rolesQuery,
      rpc: () => Promise.resolve({ data: false, error: null }),
    },
  };
});

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

let userRefs: unknown[] = [];
function Screen() {
  const [open, setOpen] = useState(false);
  userRefs.push(useAuth().user);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      {open && <div role="dialog">ticket dialog</div>}
    </div>
  );
}

const renderApp = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <ProtectedRoute requiredRoles={["admin"]}>
          <Screen />
        </ProtectedRoute>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("returning to the browser tab", () => {
  beforeEach(() => { userRefs = []; });

  it("keeps an open dialog when Supabase re-emits SIGNED_IN for the same user", async () => {
    renderApp();
    fireEvent.click(await screen.findByText("open"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Supabase fires these when the tab becomes visible again.
    await act(async () => { auth.listener?.("SIGNED_IN", session("u1")); });
    await act(async () => { auth.listener?.("TOKEN_REFRESHED", session("u1")); });

    expect(screen.getByRole("dialog")).toBeTruthy();
    // The same user keeps one object, so effects keyed on `user` don't re-run.
    const signedIn = userRefs.filter(Boolean);
    expect(new Set(signedIn).size).toBe(1);
  });

  it("still reloads roles when a different user signs in", async () => {
    renderApp();
    await screen.findByText("open");
    act(() => { auth.listener?.("SIGNED_IN", session("u2")); });
    expect(screen.queryByText("open")).toBeNull();
    await waitFor(() => expect(screen.getByText("open")).toBeTruthy());
  });
});
