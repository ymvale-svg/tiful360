import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// סקירת הממשק השבועית (15.11.26): קורא מסך בעמוד עברי מקריא את כפתור הסגירה בעברית
describe("כפתור הסגירה בחלונות", () => {
  it("Dialog – הטקסט הנסתר בעברית", () => {
    render(<Dialog open><DialogContent><DialogTitle>כותרת</DialogTitle></DialogContent></Dialog>);
    expect(screen.getByRole("button", { name: "סגירה" })).toBeTruthy();
  });
  it("Sheet – הטקסט הנסתר בעברית", () => {
    render(<Sheet open><SheetContent><SheetTitle>כותרת</SheetTitle></SheetContent></Sheet>);
    expect(screen.getByRole("button", { name: "סגירה" })).toBeTruthy();
  });
});
