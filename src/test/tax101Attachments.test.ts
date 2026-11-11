import { describe, expect, it } from "vitest";
import {
  attachmentPath,
  attachmentRequirements,
  missingRequiredAttachments,
  sanitizeAttachments,
} from "@/lib/tax101/attachments";
import { emptyTax101Form } from "@/lib/tax101/types";

const form = () => {
  const d = emptyTax101Form();
  d.id_number = "123456782";
  return d;
};

describe("Form 101 attachments", () => {
  it("asks only for the ID copy and an optional extra document by default", () => {
    const reqs = attachmentRequirements(form(), {});
    expect(reqs.map((r) => r.kind)).toEqual(["id_copy", "other"]);
    expect(reqs.every((r) => !r.required)).toBe(true);
  });

  it("requires the document of each checked credit", () => {
    const d = form();
    d.tax_credits.discharged_soldier = true;
    d.tax_credits.settlement_eligible = true;
    d.marital_status = "separated";
    const reqs = attachmentRequirements(d, { require_attachments: true, require_id_copy: true });
    const required = reqs.filter((r) => r.required).map((r) => r.kind);
    expect(required).toEqual(["id_copy", "separated", "settlement", "discharge"]);

    const files = [{ kind: "discharge" as const, name: "a.pdf", path: "c/f-att-1-discharge.pdf", size: 1, uploaded_at: "" }];
    expect(missingRequiredAttachments(reqs, files).map((r) => r.kind)).toEqual(["id_copy", "separated", "settlement"]);
  });

  it("shows documents without blocking when the company does not require them", () => {
    const d = form();
    d.tax_credits.reservist_combat = true;
    const reqs = attachmentRequirements(d, { require_attachments: false });
    expect(missingRequiredAttachments(reqs, [])).toEqual([]);
    expect(reqs.some((r) => r.kind === "reservist")).toBe(true);
  });

  it("asks for a passport instead of an ID copy when there is no ID number", () => {
    const d = emptyTax101Form();
    d.passport_number = "X1234567";
    expect(attachmentRequirements(d, {}).map((r) => r.kind)).toContain("passport");
    expect(attachmentRequirements(d, {}).map((r) => r.kind)).not.toContain("id_copy");
  });

  it("keeps the file name out of the storage path", () => {
    expect(attachmentPath("comp", "form", "id_copy", "תעודת זהות.JPG", 42)).toBe("comp/form-att-42-id_copy.jpg");
    expect(attachmentPath("comp", "form", "other", "noext", 1)).toBe("comp/form-att-1-other.bin");
  });

  it("drops attachments of other forms and unknown kinds", () => {
    const list = sanitizeAttachments(
      [
        { kind: "id_copy", name: "ok.pdf", path: "c/form-1-att-1-id_copy.pdf", size: 10, uploaded_at: "x" },
        { kind: "id_copy", name: "other form", path: "c/form-2-att-1-id_copy.pdf", size: 10 },
        { kind: "evil", name: "x", path: "c/form-1-att-2-evil.pdf" },
        "junk",
      ],
      "form-1",
    );
    expect(list.map((a) => a.name)).toEqual(["ok.pdf"]);
  });
});
