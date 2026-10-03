import { readFileSync } from "fs";
import path from "path";
import { TENANT_ONLY_SQL } from "../cli";

/**
 * Static guarantees of tenant-only.sql that hold whatever database it meets.
 * The behaviour itself is proven against a real copy by
 * `scripts/fixtures/t-cherk-14-tenant-only-acceptance.ts`.
 */

const sql = readFileSync(TENANT_ONLY_SQL, "utf8");
const code = sql.replace(/--[^\n]*/g, "");
const REPO = path.resolve(__dirname, "../../../../../..");

describe("tenant-only.sql", () => {
  it("creates functions in pg_temp only, and nothing else that outlives the session", () => {
    const creates = code.match(/CREATE\s+(OR\s+REPLACE\s+)?(TEMP\s+)?(FUNCTION|TABLE|VIEW|SCHEMA|INDEX|TRIGGER)\s+[^\s(]+/gi) ?? [];
    expect(creates.length).toBeGreaterThan(20);
    for (const statement of creates) {
      expect(statement).toMatch(/FUNCTION\s+pg_temp\.|TEMP\s+TABLE\s+tok_/i);
    }
  });

  it("never drops a database or a public table, and never truncates", () => {
    expect(code).not.toMatch(/DROP\s+DATABASE/i);
    expect(code).not.toMatch(/TRUNCATE/i);
    for (const drop of code.match(/DROP\s+TABLE[^;]*;/gi) ?? []) {
      expect(drop).toMatch(/^DROP TABLE IF EXISTS (pg_temp\.tok_\w+(,\s*)?)+;$/s);
    }
  });

  it("writes a database comment only in mark and unmark", () => {
    const comments = code.match(/COMMENT ON DATABASE/g) ?? [];
    expect(comments).toHaveLength(2);
    const mark = code.slice(code.indexOf("FUNCTION pg_temp.tenant_only_mark("), code.indexOf("FUNCTION pg_temp.tenant_only_trim("));
    expect(mark.match(/COMMENT ON DATABASE/g)).toHaveLength(2);
  });

  it("always protects the live databases of both instances", () => {
    expect(sql).toMatch(/tenant_only_always_protected\(\)[\s\S]*ARRAY\['medusa_mt', 'medusa_ru'/);
  });

  it("guards every writing entry point", () => {
    const run = code.slice(code.indexOf("FUNCTION pg_temp.tenant_only_run("));
    expect(run.indexOf("tenant_only_guard(")).toBeGreaterThan(-1);
    expect(run.indexOf("tenant_only_guard(")).toBeLessThan(run.indexOf("tenant_only_trim("));
    expect(run.indexOf("tenant_only_guard(")).toBeLessThan(run.indexOf("tenant_only_anonymize("));
  });

  it("defines every entry point the drivers call", () => {
    for (const name of ["run", "check", "assert_clean", "mark", "unmark", "media_refs"]) {
      expect(code).toContain(`FUNCTION pg_temp.tenant_only_${name}(`);
    }
  });

  it("is the file the dump script feeds psql", () => {
    const script = readFileSync(path.join(REPO, "deploy/scripts/tenant-only-dump.sh"), "utf8");
    expect(script).toContain('SQL_FILE="$REPO_ROOT/apps/backend/src/scripts/tenant-only/tenant-only.sql"');
    for (const call of ["tenant_only_mark(", "tenant_only_run(", "tenant_only_assert_clean()", "tenant_only_check(", "tenant_only_unmark()", "tenant_only_media_refs("]) {
      expect(script).toContain(call);
    }
    expect(script).toMatch(/trap cleanup EXIT/);
    expect(script).toMatch(/SOURCE_DB="\$\{SOURCE_DB:-medusa_mt\}"/);
  });

  it("raises only the documented SQLSTATE codes", () => {
    const codes = new Set(code.match(/ERRCODE = '(\w+)'/g)?.map((m) => m.slice(11, 16)));
    expect([...codes].sort()).toEqual(["UT001", "UT002", "UT003"]);
  });
});
