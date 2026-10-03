import type { TenantOnlyOptions } from "../options";
import { formatResult } from "../report";
import { runTenantOnly, type Queryable } from "../runner";

const SQL = "-- functions";

const options = (over: Partial<TenantOnlyOptions> = {}): TenantOnlyOptions => ({
  mode: "run",
  db: "postgres://x/y",
  keep: "olavka",
  anonymize: false,
  dryRun: false,
  protect: [],
  source: null,
  ...over,
});

type Answer = Record<string, unknown>[] | Error;

/** A client that records every statement and answers by the first match. */
const fakeClient = (answers: [RegExp, Answer][] = []) => {
  const calls: { text: string; values?: unknown[] }[] = [];
  const client: Queryable = {
    query: async (text, values) => {
      calls.push({ text, values });
      for (const [pattern, answer] of answers) {
        if (pattern.test(text)) {
          if (answer instanceof Error) throw answer;
          return { rows: answer };
        }
      }
      return { rows: [] };
    },
  };
  return { client, statements: () => calls.map((call) => call.text.split("(")[0].trim()), calls };
};

const sqlError = (code: string, message: string) => Object.assign(new Error(message), { code });

const runRows = (failFindings: number) => [
  { section: "table", name: "customer", detail: null, before_n: "53", after_n: "16" },
  { section: "table", name: "region", detail: null, before_n: "241", after_n: "241" },
  { section: "step", name: "delete customer", detail: null, before_n: null, after_n: "37" },
  { section: "step", name: "delete nothing", detail: null, before_n: null, after_n: "0" },
  { section: "check", name: "tenant rows other than the kept one", detail: "fail", before_n: null, after_n: String(failFindings) },
  { section: "check", name: "platform channels", detail: "info", before_n: null, after_n: "4" },
];

describe("runTenantOnly", () => {
  it("loads the functions, runs in a transaction, asserts and commits a clean run", async () => {
    const { client, statements, calls } = fakeClient([[/tenant_only_run/, runRows(0)]]);
    const result = await runTenantOnly(client, options({ protect: ["medusa_mt"] }), SQL);

    expect(statements()).toEqual([
      "-- functions",
      "BEGIN",
      "SELECT section, name, detail, before_n, after_n FROM pg_temp.tenant_only_run",
      "SELECT pg_temp.tenant_only_assert_clean",
      "COMMIT",
    ]);
    expect(calls[2].values).toEqual(["olavka", false, ["medusa_mt"]]);
    expect(result).toMatchObject({ exitCode: 0, committed: true, error: null });
    expect(result.checks).toEqual([
      { name: "tenant rows other than the kept one", severity: "fail", findings: 0 },
      { name: "platform channels", severity: "info", findings: 4 },
    ]);
  });

  it("rolls a dry run back", async () => {
    const { client, statements } = fakeClient([[/tenant_only_run/, runRows(0)]]);
    const result = await runTenantOnly(client, options({ dryRun: true }), SQL);

    expect(statements().slice(-1)).toEqual(["ROLLBACK"]);
    expect(statements()).not.toContain("COMMIT");
    expect(result).toMatchObject({ exitCode: 0, committed: false });
  });

  it("rolls back and exits 3 when a check fails, dry run or not", async () => {
    for (const dryRun of [false, true]) {
      const { client, statements } = fakeClient([[/tenant_only_run/, runRows(2)]]);
      const result = await runTenantOnly(client, options({ dryRun }), SQL);

      expect(statements()).not.toContain("COMMIT");
      expect(statements().slice(-1)).toEqual(["ROLLBACK"]);
      expect(result).toMatchObject({ exitCode: 3, committed: false });
    }
  });

  it.each([
    ["UT001", 2],
    ["UT002", 3],
    ["UT003", 1],
    ["42P01", 4],
  ])("maps SQLSTATE %s to exit %i and rolls back", async (code, exitCode) => {
    const { client, statements } = fakeClient([[/tenant_only_run/, sqlError(code, "boom")]]);
    const result = await runTenantOnly(client, options(), SQL);

    expect(result).toMatchObject({ exitCode, committed: false, error: "boom" });
    expect(statements().slice(-1)).toEqual(["ROLLBACK"]);
  });

  it("verifies inside a transaction it always rolls back", async () => {
    const { client, statements, calls } = fakeClient([
      [/tenant_only_check/, [{ check_name: "products not sold in a kept channel", severity: "fail", findings: "1" }]],
    ]);
    const result = await runTenantOnly(client, options({ mode: "verify", anonymize: true }), SQL);

    expect(statements()).toEqual([
      "-- functions",
      "BEGIN",
      "SELECT check_name, severity, findings FROM pg_temp.tenant_only_check",
      "ROLLBACK",
    ]);
    expect(calls[2].values).toEqual(["olavka", true]);
    expect(result.exitCode).toBe(3);
  });

  it("marks and unmarks outside a transaction", async () => {
    const mark = fakeClient([[/tenant_only_mark/, [{ marker: "upready-scratch-copy v1 source=medusa_mt" }]]]);
    const marked = await runTenantOnly(mark.client, options({ mode: "mark", keep: null, source: "medusa_mt" }), SQL);
    expect(mark.statements()).toEqual(["-- functions", "SELECT pg_temp.tenant_only_mark"]);
    expect(mark.calls[1].values).toEqual(["medusa_mt", []]);
    expect(marked.marker).toBe("upready-scratch-copy v1 source=medusa_mt");

    const unmark = fakeClient([[/tenant_only_unmark/, [{ removed: true }]]]);
    const unmarked = await runTenantOnly(unmark.client, options({ mode: "unmark", keep: null }), SQL);
    expect(unmarked.marker).toBe("removed");
  });
});

describe("formatResult", () => {
  it("prints counts and check names only, with dry-run wording", async () => {
    const { client } = fakeClient([[/tenant_only_run/, runRows(0)]]);
    const opts = options({ dryRun: true });
    const text = formatResult(await runTenantOnly(client, opts, SQL), opts);

    expect(text).toContain("dry run, rolled back");
    expect(text).toContain("will go");
    expect(text).toMatch(/customer\s+53\s+37\s+16/);
    expect(text).not.toMatch(/^region/m);
    expect(text).toContain("delete customer");
    expect(text).not.toContain("delete nothing");
    expect(text).toContain("all 1 checks passed");
  });

  it("names a failed check", async () => {
    const { client } = fakeClient([[/tenant_only_run/, runRows(5)]]);
    const opts = options();
    const text = formatResult(await runTenantOnly(client, opts, SQL), opts);

    expect(text).toContain("rolled back");
    expect(text).toMatch(/FAIL\s+5\s+tenant rows other than the kept one/);
    expect(text).toContain("1 check(s) FAILED");
  });
});
