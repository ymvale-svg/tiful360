import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESOURCES,
  filterableColumns,
  publicRow,
  itApiKeyMayWrite,
  resourceForScopes,
  scopeForAction,
} from "../../supabase/functions/_shared/openApiResources";

const root = join(__dirname, "../..");

/**
 * The rules an external key must never be able to break. Every assertion here is
 * a limit the user asked for: full control including deletion, payroll only for a
 * dedicated key, and no way to wipe a whole table by accident.
 */
describe("open-api — what a key may and may not do", () => {
  it("deleting needs the delete permission, writing needs write, looking needs read", () => {
    expect(scopeForAction("delete")).toBe("delete");
    expect(scopeForAction("preview_delete")).toBe("delete");
    expect(scopeForAction("create")).toBe("write");
    expect(scopeForAction("update")).toBe("write");
    expect(scopeForAction("list")).toBe("read");
    expect(scopeForAction("get")).toBe("read");
    expect(scopeForAction("capabilities")).toBe("read");
  });

  it("money is only reachable with the payroll permission", () => {
    expect(RESOURCES.payslips.payroll).toBe(true);
    expect(RESOURCES.payslip_batches.payroll).toBe(true);
    expect(RESOURCES.tax_form_101.payroll).toBe(true);
    // Everything else must stay out of the payroll-only room.
    const payrollTables = Object.entries(RESOURCES)
      .filter(([, def]) => def.payroll)
      .map(([, def]) => def.table);
    expect(payrollTables.sort()).toEqual(["payslip_batches", "payslips", "tax_form_101"]);
  });

  it("a key can delete rows, but only from an explicit id list and never more than 100 at once", () => {
    for (const def of Object.values(RESOURCES)) {
      if (!def.actions.includes("delete")) continue;
      expect(def.actions).toContain("preview_delete");
      expect(def.maxDelete ?? 100).toBeLessThanOrEqual(100);
    }
  });

  it("a key can never rewrite a company's own settings or a signed document", () => {
    expect(RESOURCES.companies.actions).toEqual(["list", "get"]);
    expect(RESOURCES.signed_documents.actions).toEqual(["list", "get"]);
    // Grants are created by the access-request flow in the app, not from outside.
    expect(RESOURCES.system_access_grants.actions).toEqual(["list", "get"]);
  });

  it("a company's encrypted password never leaves the API", () => {
    expect(RESOURCES.companies.select).toBeDefined();
    expect(RESOURCES.companies.select).not.toMatch(/git_password/);
  });

  it("records created from outside can carry the number the app normally fills in", () => {
    expect(RESOURCES.employees.writable).toContain("employee_code");
    expect(RESOURCES.assets.writable).toContain("asset_code");
    expect(RESOURCES.service_tickets.writable).toContain("ticket_code");
    expect(RESOURCES.attendance_punches.writable).toContain("employee_code_raw");
  });

  it("a resource without a writable list cannot be created or changed", () => {
    for (const [name, def] of Object.entries(RESOURCES)) {
      if (def.actions.includes("create") || def.actions.includes("update")) {
        expect(def.writable, name).toBeTruthy();
        expect(def.writable!.length, name).toBeGreaterThan(0);
      }
    }
  });

  it("a caller can only filter by columns the resource actually allows", () => {
    const cols = filterableColumns(RESOURCES.employees);
    expect(cols).toContain("id");
    expect(cols).toContain("company_id");
    expect(cols).toContain("department");
    // A column that is neither writable nor listed cannot be used to probe the table.
    expect(cols).not.toContain("linked_user_id");
  });

  it("every resource names the column that keeps companies apart", () => {
    for (const [name, def] of Object.entries(RESOURCES)) {
      expect(def.company, name).toBeTruthy();
    }
  });

  it("a key can never grant roles or change the systems and environments of a company", () => {
    // Writes run as the super admin who owns the key, so the group guards would let them through,
    // and the group/system triggers set company_id from the parent row, not from the key.
    for (const name of ["permission_groups", "permission_group_members", "system_access_systems", "system_access_resources"]) {
      expect(RESOURCES[name].actions).toEqual(["list", "get"]);
      expect(RESOURCES[name].writable).toBeUndefined();
    }
  });

  it("signatures, signing-link tokens, GPS payloads and internal snapshots never leave the API", () => {
    const hidden: Record<string, string[]> = {
      employees: ["offboarding_snapshot"],
      attendance_punches: ["raw_payload"],
      signed_documents: ["employee_signature", "issuer_signature"],
      tax_form_101: ["access_token", "token_expires_at", "signature_data"],
      onboarding_processes: ["audit_log"],
    };
    for (const [name, cols] of Object.entries(hidden)) {
      const row: Record<string, unknown> = { id: "r1", company_id: "c1" };
      for (const c of cols) row[c] = "secret";
      const out = publicRow(RESOURCES[name], row) as Record<string, unknown>;
      for (const c of cols) expect(out).not.toHaveProperty(c);
      expect(out.id).toBe("r1");
      // and none of them can be set from outside either
      for (const c of cols) expect(RESOURCES[name].writable ?? []).not.toContain(c);
    }
    expect(publicRow(RESOURCES.sites, { id: "s1", name: "x" })).toEqual({ id: "s1", name: "x" });
    expect(publicRow(RESOURCES.employees, null)).toBeNull();
  });
});

describe("open-api — identity details need their own permission (appsec:open-api-select-star-personal-data)", () => {
  const identity = [
    "id_number", "birth_date", "street", "house_number", "city", "postal_code", "po_box",
    "marital_status", "country_of_birth", "aliyah_date", "health_fund_member",
  ];

  it("a key without the identity permission sees no ID number, birth date, address or family details", () => {
    const def = resourceForScopes(RESOURCES.employees, ["read", "write", "delete", "payroll"]);
    const row: Record<string, unknown> = { id: "e1", company_id: "c1", full_name: "דנה" };
    for (const c of identity) row[c] = "x";
    const out = publicRow(def, row) as Record<string, unknown>;
    for (const c of identity) expect(out, c).not.toHaveProperty(c);
    expect(out.full_name).toBe("דנה");
  });

  it("a key without the identity permission cannot search, filter or sort by those details", () => {
    const def = resourceForScopes(RESOURCES.employees, ["read"]);
    expect(def.search).not.toContain("id_number");
    expect(def.search).toContain("full_name");
    const cols = filterableColumns(def);
    for (const c of identity) expect(cols, c).not.toContain(c);
    expect(cols).toContain("department");
  });

  it("a key with the identity permission still gets them", () => {
    const def = resourceForScopes(RESOURCES.employees, ["read", "identity"]);
    const out = publicRow(def, { id: "e1", id_number: "123" }) as Record<string, unknown>;
    expect(out.id_number).toBe("123");
    expect(def.search).toContain("id_number");
    expect(filterableColumns(def)).toContain("id_number");
  });

  it("the other resources are not changed by the identity permission", () => {
    expect(resourceForScopes(RESOURCES.sites, ["read"])).toBe(RESOURCES.sites);
  });

  it("the key table and the keys screen both know the identity permission", () => {
    const migration = readFileSync(join(root, "drizzle/migrations/0049_api_key_identity_scope.sql"), "utf8");
    expect(migration).toMatch(/api_keys_scopes_allowed[\s\S]*'identity'/);
    const screen = readFileSync(join(root, "src/components/settings/ApiKeysTab.tsx"), "utf8");
    expect(screen).toMatch(/key: "identity"/);
  });
});

describe("open-api — employees are never deleted from outside (appsec:open-api-delete-employee-cascades-payroll)", () => {
  it("employees cannot be deleted or delete-previewed; ending employment goes through offboarding", () => {
    expect(RESOURCES.employees.actions).not.toContain("delete");
    expect(RESOURCES.employees.actions).not.toContain("preview_delete");
    expect(RESOURCES.employees.actions).toEqual(["list", "get", "create", "update"]);
    expect(RESOURCES.offboarding_processes.actions).toContain("create");
  });
});

describe("it-api — keys from the keys screen need write; every call is logged (appsec:it-api-ignores-key-scopes-expiry)", () => {
  it("a key created in the keys screen (with an owner) closes tickets only with the write permission", () => {
    expect(itApiKeyMayWrite({ owner_user_id: "u1", scopes: ["read"] })).toBe(false);
    expect(itApiKeyMayWrite({ owner_user_id: "u1", scopes: ["read", "write"] })).toBe(true);
    expect(itApiKeyMayWrite({ owner_user_id: "u1", scopes: null })).toBe(false);
  });

  it("an older key without an owner keeps working as before", () => {
    expect(itApiKeyMayWrite({ owner_user_id: null, scopes: ["read"] })).toBe(true);
    expect(itApiKeyMayWrite({ owner_user_id: null, scopes: null })).toBe(true);
  });

  it("it-api checks the permission and writes every call to api_request_log", () => {
    const src = readFileSync(join(root, "supabase/functions/it-api/index.ts"), "utf8");
    expect(src).toMatch(/itApiKeyMayWrite\(/);
    expect(src).toMatch(/from\("api_request_log"\)\s*\.insert\(/);
  });
});

describe("open-api — money and balances are never written from outside (appsec:open-api-money-columns-writable)", () => {
  it("salaries, payment amounts and vacation/sick balances are not writable", () => {
    const money = ["gross_salary", "net_salary", "vacation_balance", "sick_balance", "amount"];
    for (const [name, def] of Object.entries(RESOURCES)) {
      for (const c of money) expect(def.writable ?? [], `${name}.${c}`).not.toContain(c);
    }
  });
});

describe("open-api — call log: only real keys, and old rows can be removed (appsec:open-api-unauth-log-flood-no-retention, privacy:api-request-log-undeletable-no-retention)", () => {
  it("a call without a valid key is not written to the log", () => {
    const src = readFileSync(join(root, "supabase/functions/open-api/index.ts"), "utf8");
    const fin = src.slice(src.indexOf("} finally {"));
    expect(fin).toMatch(/if \(apiKey\)\s*\{\s*await admin\.from\("api_request_log"\)\.insert\(/);
  });

  it("the log trigger lets only service_role delete, and only rows older than 24 months", () => {
    const sql = readFileSync(join(root, "drizzle/migrations/0050_api_request_log_retention_delete.sql"), "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.api_request_log_immutable\(\)/);
    expect(sql).toMatch(/TG_OP = 'DELETE'/);
    expect(sql).toMatch(/current_user = 'service_role'/);
    expect(sql).toMatch(/OLD\.created_at < now\(\) - interval '24 months'/);
    // updates stay blocked for everyone
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).not.toMatch(/TG_OP = 'UPDATE'/);
  });
});

describe("open-api — database errors stay in the log (appsec:open-api-db-error-messages-returned)", () => {
  const src = readFileSync(join(root, "supabase/functions/open-api/index.ts"), "utf8");

  it("no Postgres error text is put into a message that goes back to the caller", () => {
    expect(src).not.toMatch(/new ApiError\([^;]*\.message/);
    expect(src).toMatch(/throw new DbError\("הקריאה נכשלה\.", error\)/);
  });

  it("the Postgres error text is kept in the call log only", () => {
    expect(src).toMatch(/log\.error = e instanceof DbError/);
    expect(src).toMatch(/return json\(\{ ok: false, error: message \}/);
  });
});

describe("open-api — server to server only (appsec:open-api-cors-wildcard)", () => {
  it("the open API sends no CORS headers, so a browser page cannot call it", () => {
    const src = readFileSync(join(root, "supabase/functions/open-api/index.ts"), "utf8");
    expect(src).not.toMatch(/corsHeaders/);
    expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  });

  it("the documentation says the key must never be put in browser code", () => {
    const screen = readFileSync(join(root, "src/components/settings/ApiKeysTab.tsx"), "utf8");
    expect(screen).toMatch(/אסור לשים את המפתח בקוד שרץ בדפדפן/);
  });
});
