import { describe, it, expect } from "vitest";
import { sanitizeStoragePath } from "@/lib/protocolUpload";

describe("sanitizeStoragePath", () => {
  it("keeps ascii paths unchanged", () => {
    expect(sanitizeStoragePath("comp/emp/asset-123.pdf")).toBe("comp/emp/asset-123.pdf");
  });
  it("replaces hebrew file names but keeps the extension", () => {
    expect(sanitizeStoragePath("comp/emp/123-חתימה.jpeg")).toBe("comp/emp/123-.jpeg");
  });
  it("strips non-ascii from extension too", () => {
    const out = sanitizeStoragePath("a/b/c.טיפ");
    expect(out).toBe("a/b/c");
  });
  it("never returns an empty segment", () => {
    expect(sanitizeStoragePath("a/חתימה")).toBe("a/file");
  });
});
