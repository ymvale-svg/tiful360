import { describe, it, expect } from "vitest";
import { leaveAttachmentPath } from "@/lib/leaveAttachmentPath";
import { leaveAttachmentPath as edgeLeaveAttachmentPath } from "../../supabase/functions/_shared/leaveAttachmentPath";

const EMP = "3f1c2a9e-0000-4000-8000-000000000001";
const FILE = "9b2d7c4e-1111-4111-8111-111111111111.pdf";
const PATH = `${EMP}/${FILE}`;
const LEGACY = `https://abcd.supabase.co/storage/v1/object/sign/leave-attachments/${PATH}?token=eyJhbGciOi.xyz`;

describe.each([
  ["app", leaveAttachmentPath],
  ["edge", edgeLeaveAttachmentPath],
])("leaveAttachmentPath (%s)", (_name, fn) => {
  it("keeps a bare object path", () => expect(fn(PATH)).toBe(PATH));
  it("extracts the path from a legacy signed URL", () => expect(fn(LEGACY)).toBe(PATH));
  it("decodes percent-encoding in a legacy URL", () =>
    expect(fn(LEGACY.replace(FILE, "a%20b.pdf"))).toBe(`${EMP}/a b.pdf`));
  it("returns null for empty values", () => {
    expect(fn(null)).toBeNull();
    expect(fn(undefined)).toBeNull();
    expect(fn("  ")).toBeNull();
  });
  it("rejects signed URLs for another bucket", () =>
    expect(fn(LEGACY.replace("/leave-attachments/", "/payslips/"))).toBeNull());
  it("rejects public / non-signed storage URLs and arbitrary links", () => {
    expect(fn(LEGACY.replace("/object/sign/", "/object/public/"))).toBeNull();
    expect(fn("https://evil.example/file.pdf")).toBeNull();
    expect(fn("javascript:alert(1)")).toBeNull();
    expect(fn("not a url://x")).toBeNull();
  });
  it("rejects traversal and malformed paths", () => {
    expect(fn(`../${PATH}`)).toBeNull();
    expect(fn(`/${PATH}`)).toBeNull();
    expect(fn(`${EMP}//${FILE}`)).toBeNull();
    expect(fn(`${PATH}?token=x`)).toBeNull();
    expect(fn(LEGACY.replace(FILE, "%E0%A4%A"))).toBeNull();
  });
});

