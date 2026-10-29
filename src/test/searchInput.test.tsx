import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "@/components/ui/search-input";

function Harness({ initial = "", onOuterKey }: { initial?: string; onOuterKey?: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div onKeyDown={onOuterKey}>
      <SearchInput label="חיפוש עובדים" value={v} onValueChange={setV} trailing={<kbd>⌘K</kbd>} />
    </div>
  );
}

describe("SearchInput", () => {
  it("is a labelled search box that uses the label as placeholder", () => {
    render(<Harness />);
    const box = screen.getByRole("searchbox", { name: "חיפוש עובדים" }) as HTMLInputElement;
    expect(box.placeholder).toBe("חיפוש עובדים");
    expect(screen.getByText("⌘K")).toBeTruthy();
  });

  it("shows a clear button instead of the trailing hint once there is text", () => {
    render(<Harness />);
    const box = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "דנה" } });
    expect(screen.queryByText("⌘K")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ניקוי החיפוש" }));
    expect(box.value).toBe("");
    expect(document.activeElement).toBe(box);
  });

  it("clears on Escape without letting it close what's around it, then lets the next one through", () => {
    const outer = vi.fn();
    render(<Harness initial="מחשב" onOuterKey={outer} />);
    const box = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("");
    expect(outer).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to the caller's own handler when it handles it", () => {
    const onKeyDown = vi.fn((e: React.KeyboardEvent) => e.preventDefault());
    const change = vi.fn();
    render(<SearchInput label="חיפוש" value="x" onValueChange={change} onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onKeyDown).toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
});
