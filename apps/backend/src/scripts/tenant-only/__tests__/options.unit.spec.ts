import { parseTenantOnlyArgs, TenantOnlyUsageError } from "../options";

const DB = "postgres://user@127.0.0.1:5433/scratch_copy";

const parse = (...argv: string[]) => parseTenantOnlyArgs(["--db", DB, ...argv]);

describe("parseTenantOnlyArgs", () => {
  it("reads a trim", () => {
    expect(parse("--keep", "olavka")).toEqual({
      mode: "run",
      db: DB,
      keep: "olavka",
      anonymize: false,
      dryRun: false,
      protect: [],
      source: null,
    });
  });

  it("reads a dry-run trim with anonymization and extra protected names", () => {
    expect(parse("--keep", "olavka", "--anonymize", "--dry-run", "--protect", "a_db", "--protect", "b-db")).toMatchObject({
      mode: "run",
      keep: "olavka",
      anonymize: true,
      dryRun: true,
      protect: ["a_db", "b-db"],
    });
  });

  it("anonymizes every tenant when no handle is given", () => {
    expect(parse("--anonymize")).toMatchObject({ mode: "run", keep: null, anonymize: true });
  });

  it("reads verify, mark, unmark and media-refs", () => {
    expect(parse("--verify", "--keep", "olavka")).toMatchObject({ mode: "verify", keep: "olavka" });
    expect(parse("--verify", "--anonymize")).toMatchObject({ mode: "verify", anonymize: true });
    expect(parse("--mark", "--source", "medusa_mt")).toMatchObject({ mode: "mark", source: "medusa_mt" });
    expect(parse("--unmark")).toMatchObject({ mode: "unmark" });
    expect(parse("--media-refs", "--keep", "olavka")).toMatchObject({ mode: "media-refs", keep: "olavka" });
  });

  it("answers help before anything else", () => {
    expect(parseTenantOnlyArgs(["--help"])).toBe("help");
  });

  it.each([
    [[], "--db is required"],
    [["--db", "mysql://x/y", "--keep", "olavka"], "postgres://"],
    [["--db"], "--db needs a value"],
    [["--db", DB, "--keep", "--anonymize"], "--keep needs a value"],
    [["--db", DB], "name a tenant"],
    [["--db", DB, "--verify"], "name a tenant"],
    [["--db", DB, "--keep", "Olavka"], "is not a tenant handle"],
    [["--db", DB, "--keep", "olavka; drop"], "is not a tenant handle"],
    [["--db", DB, "--keep", "a", "--keep", "b"], "more than once"],
    [["--db", DB, "--keep", "olavka", "--protect", "x y"], "is not a database name"],
    [["--db", DB, "--keep", "olavka", "--verify", "--dry-run"], "drop --dry-run"],
    [["--db", DB, "--mark", "--keep", "olavka"], "takes no --keep"],
    [["--db", DB, "--mark", "--unmark"], "cannot be combined"],
    [["--db", DB, "--keep", "olavka", "--source", "x"], "--source only goes with --mark"],
    [["--db", DB, "--media-refs"], "--media-refs takes --keep"],
    [["--db", DB, "--keep", "olavka", "--force"], "unknown argument"],
  ])("refuses %j", (argv, message) => {
    expect(() => parseTenantOnlyArgs(argv as string[])).toThrow(TenantOnlyUsageError);
    expect(() => parseTenantOnlyArgs(argv as string[])).toThrow(message);
  });
});
