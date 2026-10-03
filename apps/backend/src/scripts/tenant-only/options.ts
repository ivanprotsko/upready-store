/**
 * Command line of the tenant-only tool (README.md next to this file). Pure:
 * no I/O, so the unit suite covers every combination the CLI accepts or
 * refuses.
 */

export type TenantOnlyMode = "run" | "verify" | "mark" | "unmark" | "media-refs";

export type TenantOnlyOptions = {
  mode: TenantOnlyMode;
  /** Connection string of the scratch copy. Never printed. */
  db: string;
  /** Handle of the tenant to keep; null keeps every tenant (anonymize only). */
  keep: string | null;
  anonymize: boolean;
  /** Run inside a transaction, print the counts, roll back. */
  dryRun: boolean;
  /** Database names refused on top of the ones the SQL always refuses. */
  protect: string[];
  /** What --mark records as the copy's source. */
  source: string | null;
  /** Rewrite every URL on this host... */
  mediaHostFrom: string | null;
  /** ...to this one (the new server's engine domain). */
  mediaHostTo: string | null;
  /** Hosts no row may mention after the run (subdomains included). */
  forbidHosts: string[];
  /** Further hosts to move, `from=to` each (an old storefront subdomain). */
  rewriteHosts: string[];
};

export const USAGE = `Usage: npx ts-node src/scripts/tenant-only/cli.ts --db <postgres-url> [options]

  --keep <handle>     keep this tenant, delete every other tenant's rows
  --anonymize         replace personal data, delete passwords, tokens and secrets
  --dry-run           run in a transaction, print the counts, roll back
  --verify            check only, write nothing (with --keep and/or --anonymize)
  --mark              put the scratch-copy marker on the database
  --source <db>       with --mark: the database the copy was made from
  --unmark            remove the scratch-copy marker
  --media-refs        list /static/ prefixes the data references (with --keep)
  --media-host-from <host> --media-host-to <host>
                      rewrite every URL on the first host to the second
  --rewrite-host <from>=<to>
                      rewrite URLs on another host as well (repeatable)
  --forbid-host <host>  fail when any row mentions this host or a subdomain
                      (repeatable; every rewritten host is forbidden too)
  --protect <db>      refuse this database name as well (repeatable)

Exit codes: 0 done, 1 usage, 2 guard refused, 3 verification failed, 4 error.`;

export class TenantOnlyUsageError extends Error {
  readonly exitCode = 1;
}

const HANDLE = /^[a-z0-9][a-z0-9-]*$/;
const DB_NAME = /^[A-Za-z0-9_-]+$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

const VALUE_FLAGS = new Set([
  "--db",
  "--keep",
  "--protect",
  "--source",
  "--media-host-from",
  "--media-host-to",
  "--forbid-host",
  "--rewrite-host",
]);
const BOOLEAN_FLAGS = new Set(["--anonymize", "--dry-run", "--verify", "--mark", "--unmark", "--media-refs", "--help"]);

export const parseTenantOnlyArgs = (argv: string[]): TenantOnlyOptions | "help" => {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new TenantOnlyUsageError(`${arg} needs a value`);
      }
      values.set(arg, [...(values.get(arg) ?? []), value]);
      i++;
    } else if (BOOLEAN_FLAGS.has(arg)) {
      flags.add(arg);
    } else {
      throw new TenantOnlyUsageError(`unknown argument "${arg}"`);
    }
  }

  if (flags.has("--help")) {
    return "help";
  }

  const single = (flag: string): string | null => {
    const list = values.get(flag) ?? [];
    if (list.length > 1) {
      throw new TenantOnlyUsageError(`${flag} given more than once`);
    }
    return list[0] ?? null;
  };

  const db = single("--db");
  if (!db) {
    throw new TenantOnlyUsageError("--db is required");
  }
  if (!/^postgres(ql)?:\/\//.test(db)) {
    throw new TenantOnlyUsageError("--db must be a postgres:// connection string");
  }

  const keep = single("--keep");
  if (keep !== null && !HANDLE.test(keep)) {
    throw new TenantOnlyUsageError(`--keep "${keep}" is not a tenant handle`);
  }

  const protect = values.get("--protect") ?? [];
  for (const name of protect) {
    if (!DB_NAME.test(name)) {
      throw new TenantOnlyUsageError(`--protect "${name}" is not a database name`);
    }
  }

  const source = single("--source");
  const mediaHostFrom = single("--media-host-from");
  const mediaHostTo = single("--media-host-to");
  const forbidHosts = values.get("--forbid-host") ?? [];
  const rewriteHosts = values.get("--rewrite-host") ?? [];
  const rewriteParts = rewriteHosts.map((pair) => {
    const parts = pair.split("=");
    if (parts.length !== 2 || parts[0] === parts[1]) {
      throw new TenantOnlyUsageError(`--rewrite-host "${pair}" must be <from>=<to> with two different hosts`);
    }
    return parts;
  });
  for (const host of [mediaHostFrom, mediaHostTo, ...forbidHosts, ...rewriteParts.flat()]) {
    if (host !== null && !HOST.test(host)) {
      throw new TenantOnlyUsageError(`"${host}" is not a lowercase host name`);
    }
  }
  if ((mediaHostFrom === null) !== (mediaHostTo === null)) {
    throw new TenantOnlyUsageError("--media-host-from and --media-host-to go together");
  }
  if (mediaHostFrom !== null && mediaHostFrom === mediaHostTo) {
    throw new TenantOnlyUsageError("--media-host-to must differ from --media-host-from");
  }
  const anonymize = flags.has("--anonymize");
  const dryRun = flags.has("--dry-run");

  const modes: TenantOnlyMode[] = [];
  if (flags.has("--mark")) modes.push("mark");
  if (flags.has("--unmark")) modes.push("unmark");
  if (flags.has("--verify")) modes.push("verify");
  if (flags.has("--media-refs")) modes.push("media-refs");
  if (modes.length > 1) {
    throw new TenantOnlyUsageError(`--${modes.join(" and --")} cannot be combined`);
  }
  const mode: TenantOnlyMode = modes[0] ?? "run";

  if (source !== null && mode !== "mark") {
    throw new TenantOnlyUsageError("--source only goes with --mark");
  }
  if ((mode === "mark" || mode === "unmark") && (keep !== null || anonymize || dryRun)) {
    throw new TenantOnlyUsageError(`--${mode} takes no --keep, --anonymize or --dry-run`);
  }
  if ((mediaHostFrom !== null || rewriteHosts.length > 0) && mode !== "run") {
    throw new TenantOnlyUsageError("--media-host-from and --rewrite-host only go with a run; verify with --forbid-host");
  }
  if (forbidHosts.length > 0 && mode !== "run" && mode !== "verify") {
    throw new TenantOnlyUsageError("--forbid-host goes with a run or --verify");
  }
  if (mode === "run" && keep === null && !anonymize && mediaHostFrom === null && rewriteHosts.length === 0) {
    throw new TenantOnlyUsageError("name a tenant with --keep, ask for --anonymize, change the media host, or any of them");
  }
  if (mode === "verify" && keep === null && !anonymize && forbidHosts.length === 0) {
    throw new TenantOnlyUsageError("name a tenant with --keep, ask for --anonymize, forbid a host, or any of them");
  }
  if (mode === "verify" && dryRun) {
    throw new TenantOnlyUsageError("--verify writes nothing already; drop --dry-run");
  }
  if (mode === "media-refs" && (keep === null || anonymize || dryRun)) {
    throw new TenantOnlyUsageError("--media-refs takes --keep and nothing else");
  }

  return { mode, db, keep, anonymize, dryRun, protect, source, mediaHostFrom, mediaHostTo, forbidHosts, rewriteHosts };
};
