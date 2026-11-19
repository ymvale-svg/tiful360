// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Issue #58: signing from the public link must not change the form's content.
// The token RPCs are open to anon, so these checks must live in the database.

const root = resolve(__dirname, "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

/** Body of the most recent CREATE OR REPLACE of a function across all migrations. */
function latestDefinition(fn: string): { file: string; body: string } {
  let found: { file: string; body: string } | null = null;
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\$\\$;`, "g");
  for (const file of migrations) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    const all = sql.match(re);
    if (all) found = { file, body: all[all.length - 1] };
  }
  if (!found) throw new Error(`no definition of ${fn}`);
  return found;
}

const uploadFn = readFileSync(resolve(root, "supabase/functions/sign-form-upload-url/index.ts"), "utf8");

describe("sign-by-token RPCs (issue #58)", () => {
  for (const fn of ["sign_handover_form_by_token", "sign_offboarding_form_by_token"]) {
    describe(fn, () => {
      const { body } = latestDefinition(fn);

      it("keeps the stored content and ignores the browser's _form_snapshot", () => {
        // The parameter may stay in the signature, but it must never be read.
        const afterSignature = body.slice(body.indexOf("AS $$"));
        expect(afterSignature).not.toMatch(/_form_snapshot/);
        expect(body).toMatch(/form_snapshot = CASE/);
      });

      it("rejects an empty or oversized signature on the server", () => {
        expect(body).toMatch(/_is_valid_signature_data\(_signature\)/);
      });

      it("accepts only this form's storage path for the PDF and the attachment", () => {
        expect(body).toMatch(/_pdf_url ~ \(v_prefix/);
        expect(body).toMatch(/_attached_url ~ \(v_prefix/);
        // Fail closed when the pattern cannot be evaluated (NULL).
        expect(body).toMatch(/NOT COALESCE\(_pdf_url ~/);
        expect(body).toMatch(/NOT COALESCE\(_attached_url ~/);
      });
    });
  }

  it("matches the paths the sign-form-upload-url function issues", () => {
    // If the upload layout changes, the path checks in the migration must change with it.
    expect(uploadFn).toContain("`${f.company_id}/${f.employee_id}/${assetId}-${ts}.pdf`");
    expect(uploadFn).toContain("`${f.company_id}/${f.employee_id}/${assetId}-attached-${ts}.${safeExt}`");
    expect(uploadFn).toContain("`offboarding/${f.company_id}/${f.employee_id}/${f.id}-${ts}.pdf`");
    expect(uploadFn).toContain("`offboarding/${f.company_id}/${f.employee_id}/${f.id}-attached-${ts}.${safeExt}`");
  });

  describe("the path patterns", () => {
    const company = "c0000000-0000-0000-0000-000000000001";
    const employee = "e0000000-0000-0000-0000-000000000001";
    const asset = "a0000000-0000-0000-0000-000000000001";
    const prefix = `^${company}/${employee}/${asset}-`;
    const pdf = new RegExp(prefix + "[0-9]+\\.pdf$");
    const attached = new RegExp(prefix + "attached-[0-9]+\\.[a-z0-9]+$");

    it("accept the uploaded paths", () => {
      expect(pdf.test(`${company}/${employee}/${asset}-1731700000000.pdf`)).toBe(true);
      expect(attached.test(`${company}/${employee}/${asset}-attached-1731700000000.jpg`)).toBe(true);
    });

    it("reject other companies, other forms, traversal and URLs", () => {
      expect(pdf.test(`c0000000-0000-0000-0000-000000000002/${employee}/${asset}-1.pdf`)).toBe(false);
      expect(pdf.test(`${company}/${employee}/a0000000-0000-0000-0000-000000000002-1.pdf`)).toBe(false);
      expect(pdf.test(`${company}/${employee}/${asset}-1.pdf/../../x.pdf`)).toBe(false);
      expect(attached.test("https://evil.example/x.pdf")).toBe(false);
    });
  });
});

describe("submit_tax_form_101_by_token (issue #58)", () => {
  const { body } = latestDefinition("submit_tax_form_101_by_token");

  it("validates the signature, required fields and the ID number before signing", () => {
    expect(body).toMatch(/_is_valid_signature_data\(_signature\)/);
    expect(body).toMatch(/_is_valid_israeli_id\(v_id\)/);
    for (const field of ["first_name", "last_name", "passport_number", "gender", "birth_date", "city", "street", "marital_status"]) {
      expect(body).toContain(`'${field}'`);
    }
    // Validation happens before the row is marked signed.
    expect(body.indexOf("_is_valid_signature_data")).toBeLessThan(body.indexOf("status = 'signed'"));
  });

  it("accepts only this form's PDF path", () => {
    expect(body).toMatch(/NOT COALESCE\(_pdf_url ~ .*v_form\.id::text/);
  });
});
