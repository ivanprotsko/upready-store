/**
 * Argument parsing shared by the two Wildberries scripts
 * (w01-wb-readonly-client).
 *
 * `medusa exec` has its own arg parser in front of the script, and it eats
 * some of what you type: a leading `--` is swallowed entirely, measured
 * 2026-09-15 and written down in `backfill-tenant-locale-settings.ts`. So the
 * scripts accept every shape the operator is likely to reach for and do not
 * care which one arrives:
 *
 *   tenant=cherkashino            a dash-less pair, what always survives
 *   --tenant=cherkashino          the same with dashes, when they survive
 *   --tenant cherkashino          two words, when they survive
 *   WB_TENANT=cherkashino         an environment variable, which nothing eats
 *
 * The last one is the form the acceptance commands use, because it is the only
 * one that cannot be reshaped by a wrapper (`pnpm --filter …` is a second
 * parser in the chain).
 */

export type WbScriptArgs = {
  tenant: string | null;
  kind: string | null;
  flags: Set<string>;
};

const NAMES = ["tenant", "kind"] as const;

export const parseWbArgs = (
  args: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): WbScriptArgs => {
  const values: Record<string, string | null> = { tenant: null, kind: null };
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const raw = String(args[index]);
    const bare = raw.replace(/^--/, "");

    const [name, ...rest] = bare.split("=");
    if (rest.length && NAMES.includes(name as (typeof NAMES)[number])) {
      values[name] = rest.join("=");
      continue;
    }

    if (NAMES.includes(bare as (typeof NAMES)[number])) {
      const next = args[index + 1];
      if (next && !String(next).startsWith("-")) {
        values[bare] = String(next);
        index += 1;
        continue;
      }
    }

    flags.add(bare);
  }

  return {
    tenant: values.tenant ?? env.WB_TENANT ?? null,
    kind: values.kind ?? env.WB_KIND ?? null,
    flags,
  };
};
