import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";

const DATA_URL = "data:image/png;base64,c2lnbmF0dXJl";

function fakeContext() {
  return new Proxy({ measureText: (t: string) => ({ width: t.length * 10 }) } as Record<string, unknown>, {
    get(target, key) {
      if (!(key in target)) target[key as string] = vi.fn();
      return target[key as string];
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  });
}

describe("SignaturePad typed-name mode (keyboard alternative)", () => {
  let ctx: ReturnType<typeof fakeContext>;

  beforeEach(() => {
    ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(DATA_URL);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 160 } as DOMRect);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("signs by typing a name and keeps the same output API", async () => {
    const ref = createRef<SignaturePadHandle>();
    render(<SignaturePad ref={ref} label="חתימת העובד/ת" />);

    expect(ref.current?.isEmpty()).toBe(true);
    expect(ref.current?.getDataUrl()).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "הקלדה" }));
    expect((screen.getByRole("radio", { name: "הקלדה" }) as HTMLInputElement).checked).toBe(true);

    const input = screen.getByLabelText("הקלדת שם מלא");
    await act(async () => { fireEvent.change(input, { target: { value: "ישראל ישראלי" } }); });

    expect(ref.current?.isEmpty()).toBe(false);
    expect(ref.current?.getDataUrl()).toBe(DATA_URL);
    expect(ctx.fillText).toHaveBeenCalledWith("ישראל ישראלי", expect.any(Number), expect.any(Number), expect.any(Number));

    fireEvent.click(screen.getByRole("button", { name: "נקה חתימת העובד/ת" }));
    expect(ref.current?.isEmpty()).toBe(true);
    expect(ref.current?.getDataUrl()).toBeNull();
    expect((screen.getByLabelText("הקלדת שם מלא") as HTMLInputElement).value).toBe("");
  });
});
