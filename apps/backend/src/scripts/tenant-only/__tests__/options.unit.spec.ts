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
      mediaHostFrom: null,
      mediaHostTo: null,
      forbidHosts: [],
      rewriteHosts: [],
      dropEmailDomains: [],
    });
  });

  it("reads a media host change and forbidden hosts", () => {
    expect(
      parse("--keep", "olavka", "--media-host-from", "shipshift.dev", "--media-host-to", "api.cherkashino.ru",
        "--forbid-host", "upready.dev", "--forbid-host", "cherkashino.com",
        "--rewrite-host", "cherkashino.shipshift.dev=cherkashino.ru",
        "--drop-customers-by-email-domain", "upready.dev"),
    ).toMatchObject({
      rewriteHosts: ["cherkashino.shipshift.dev=cherkashino.ru"],
      dropEmailDomains: ["upready.dev"],
      mode: "run",
      mediaHostFrom: "shipshift.dev",
      mediaHostTo: "api.cherkashino.ru",
      forbidHosts: ["upready.dev", "cherkashino.com"],
    });
    expect(parse("--verify", "--forbid-host", "shipshift.dev")).toMatchObject({ mode: "verify", forbidHosts: ["shipshift.dev"] });
    expect(parse("--media-host-from", "a.dev", "--media-host-to", "b.ru")).toMatchObject({ mode: "run", keep: null });
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
    [["--db", DB, "--keep", "olavka", "--media-host-from", "shipshift.dev"], "go together"],
    [["--db", DB, "--keep", "olavka", "--media-host-to", "api.cherkashino.ru"], "go together"],
    [["--db", DB, "--keep", "olavka", "--media-host-from", "a.dev", "--media-host-to", "a.dev"], "must differ"],
    [["--db", DB, "--keep", "olavka", "--media-host-from", "Shipshift.dev", "--media-host-to", "b.ru"], "lowercase host"],
    [["--db", DB, "--keep", "olavka", "--forbid-host", "https://x.dev"], "lowercase host"],
    [["--db", DB, "--verify", "--keep", "o", "--media-host-from", "a.dev", "--media-host-to", "b.ru"], "only go with a run"],
    [["--db", DB, "--mark", "--forbid-host", "a.dev"], "--forbid-host goes with"],
    [["--db", DB, "--keep", "olavka", "--rewrite-host", "a.dev"], "must be <from>=<to>"],
    [["--db", DB, "--keep", "olavka", "--rewrite-host", "a.dev=a.dev"], "must be <from>=<to>"],
    [["--db", DB, "--keep", "olavka", "--rewrite-host", "a.dev=B.ru"], "lowercase host"],
    [["--db", DB, "--verify", "--keep", "o", "--rewrite-host", "a.dev=b.ru"], "only go with a run"],
    [["--db", DB, "--verify", "--keep", "o", "--drop-customers-by-email-domain", "a.dev"], "only go with a run"],
    [["--db", DB, "--keep", "o", "--drop-customers-by-email-domain", "@a.dev"], "lowercase host"],
  ])("refuses %j", (argv, message) => {
    expect(() => parseTenantOnlyArgs(argv as string[])).toThrow(TenantOnlyUsageError);
    expect(() => parseTenantOnlyArgs(argv as string[])).toThrow(message);
  });
});
