import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("attendance SECURITY DEFINER RPCs keep their locked-down grants", () => {
  const sql = read("drizzle/migrations/0052_restate_attendance_rpc_grants.sql");

  it("get_daily_missing_punches (all companies, no auth check) is for service_role only", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_daily_missing_punches\(date\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_daily_missing_punches\(date\) TO service_role;/);
  });

  it("get_attendance_gaps is not callable by anon", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_attendance_gaps\(uuid, date, date\) FROM PUBLIC, anon;/);
  });

  it("the migration is registered in the drizzle journal", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toContain("0052_restate_attendance_rpc_grants");
  });
});
