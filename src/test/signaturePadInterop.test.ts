import { describe, expect, it } from "vitest";
import { SignatureCanvasView, unwrapComponent } from "@/components/SignaturePad";

const Comp = () => null;

describe("signature canvas module interop", () => {
  it("unwraps the UMD module object React cannot render", () => {
    expect(unwrapComponent({ __esModule: true, default: Comp })).toBe(Comp);
  });

  it("keeps a component that is already callable", () => {
    expect(unwrapComponent(Comp)).toBe(Comp);
  });

  it("never hands React a plain object", () => {
    expect(typeof unwrapComponent({ __esModule: true, default: Comp })).toBe("function");
    expect(typeof SignatureCanvasView).toBe("function");
  });
});
