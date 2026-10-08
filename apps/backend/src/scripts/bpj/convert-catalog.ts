import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { convertBpjCatalog, formatCounts, type BpjSourceProduct } from "./catalog";

/**
 * The command line of the Beauty Pro Japan converter (t-2026-10-06-09, stage B1). It needs
 * no database and no running backend, so it runs under ts-node rather than `medusa exec`:
 *
 *   cd apps/backend
 *   npx ts-node src/scripts/bpj/convert-catalog.ts --catalog <master-catalog.json> \
 *     --tenant <shop handle> --currency rub --rate-from-jpy 0.55 [--round-to 1] --out <plan.json>
 *
 * It prints numbers only. The plan carries the client's texts, so `--out` inside this
 * repository is refused: the plan lives next to the evidence of the task, never in git.
 */

export type ConvertArgs = {
  catalog: string;
  tenant: string;
  currency: string;
  rateFromJpy: number;
  roundTo?: number;
  out: string;
};

export const CONVERT_USAGE =
  "usage: npx ts-node src/scripts/bpj/convert-catalog.ts --catalog <file> --tenant <handle> --currency <code> --rate-from-jpy <number> [--round-to <step>] --out <file>";

/** `--name value` pairs into the converter's arguments, or the sentence that says what is wrong. */
export const parseConvertArgs = (argv: string[]): ConvertArgs | { error: string } => {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      return { error: `argument "${name}" needs a value. ${CONVERT_USAGE}` };
    }
    values.set(name.slice(2), value);
  }

  const known = new Set(["catalog", "tenant", "currency", "rate-from-jpy", "round-to", "out"]);
  const unknown = [...values.keys()].filter((name) => !known.has(name));
  if (unknown.length) return { error: `unknown argument(s) ${unknown.map((name) => `--${name}`).join(", ")}. ${CONVERT_USAGE}` };

  const missing = ["catalog", "tenant", "currency", "rate-from-jpy", "out"].filter((name) => !values.get(name));
  if (missing.length) return { error: `missing ${missing.map((name) => `--${name}`).join(", ")}. ${CONVERT_USAGE}` };

  return {
    catalog: values.get("catalog") as string,
    tenant: values.get("tenant") as string,
    currency: (values.get("currency") as string).toLowerCase(),
    rateFromJpy: Number(values.get("rate-from-jpy")),
    ...(values.has("round-to") ? { roundTo: Number(values.get("round-to")) } : {}),
    out: values.get("out") as string,
  };
};

/** The working copy this file sits in: the nearest directory up that holds `.git`, or null. */
export const repositoryRootOf = (directory: string): string | null => {
  let current = path.resolve(directory);
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

export const isInside = (file: string, directory: string): boolean => {
  const relative = path.relative(directory, path.resolve(file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export const main = (argv: string[], repositoryRoot: string | null = repositoryRootOf(__dirname)): number => {
  const args = parseConvertArgs(argv);
  if ("error" in args) {
    console.error(`bpj convert: ${args.error}`);
    return 1;
  }
  if (repositoryRoot && isInside(args.out, repositoryRoot)) {
    console.error(`bpj convert: --out ${args.out} is inside the repository ${repositoryRoot}; the plan carries the client's texts and goes outside it.`);
    return 1;
  }

  const catalog = JSON.parse(readFileSync(args.catalog, "utf8")) as BpjSourceProduct[];
  const plan = convertBpjCatalog(catalog, {
    tenantHandle: args.tenant,
    currency: args.currency,
    rateFromJpy: args.rateFromJpy,
    ...(args.roundTo !== undefined ? { roundTo: args.roundTo } : {}),
  });

  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, JSON.stringify(plan, null, 2) + "\n", "utf8");

  console.log(`bpj convert: ${catalog.length} products read, plan for shop "${args.tenant}" in ${args.currency} at ${args.rateFromJpy} per yen`);
  for (const line of formatCounts(plan.counts)) console.log(`bpj convert: ${line}`);
  return 0;
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
