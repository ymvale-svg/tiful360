import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { SessionHomeRedirect } from "@/components/SessionHomeRedirect";

function Harness({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <SessionHomeRedirect />
      <nav>
        <Link to="/employees">to-employees</Link>
        <Link to="/payroll">to-payroll</Link>
      </nav>
      <Routes>
        <Route path="/" element={<div>dashboard</div>} />
        <Route path="/employees" element={<div>employees</div>} />
        <Route path="/payroll" element={<div>payroll</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SessionHomeRedirect", () => {
  beforeEach(() => sessionStorage.clear());

  it("redirects the first load of a fresh session to home, then lets sidebar navigation through", () => {
    render(<Harness initial="/employees" />);
    expect(screen.getByText("dashboard")).toBeTruthy();

    fireEvent.click(screen.getByText("to-payroll"));
    expect(screen.getByText("payroll")).toBeTruthy();

    fireEvent.click(screen.getByText("to-employees"));
    expect(screen.getByText("employees")).toBeTruthy();
  });

  it("does not redirect when the session is already active", () => {
    sessionStorage.setItem("tiful360-session-active", "1");
    render(<Harness initial="/employees" />);
    expect(screen.getByText("employees")).toBeTruthy();
  });

  it("lets navigation from home through on a fresh session", () => {
    render(<Harness initial="/" />);
    fireEvent.click(screen.getByText("to-employees"));
    expect(screen.getByText("employees")).toBeTruthy();
  });
});
