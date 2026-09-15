/**
 * Argument parsing shared by the two Ozon scripts (w11-ozon-readonly-client).
 *
 * The same shape as `wb-args.ts`, and deliberately a copy rather than a shared
 * helper: `wb-args.ts` belongs to the Wildberries task and w12 folds both into
 * the marketplace core. Changing it here would edit another task's file for no
 * gain today.
 *
 * `medusa exec` has its own arg parser in front of the script and eats some of
 * what you type (a leading `--` is swallowed entirely, measured 2026-09-15 and
 * written down in `backfill-tenant-locale-settings.ts`), so every shape the
 * operator is likely to reach for is accepted:
 *
 *   tenant=cherkashino            a dash-less pair, what always survives
 *   --tenant=cherkashino          the same with dashes, when they survive
 *   --tenant cherkashino          two words, when they survive
 *   OZON_TENANT=cherkashino       an environment variable, which nothing eats
 *
 * The last one is the form the acceptance commands use, because it is the only
 * one that cannot be reshaped by a wrapper (`pnpm --filter …` is a second
 * parser in the chain).
 */

export type OzonScriptArgs = {
  tenant: string | null;
  kind: string | null;
  /** `--fixtures`, or `OZON_FIXTURES=1`: read recorded answers, open no socket. */
  fixtures: boolean;
  flags: Set<string>;
};

const NAMES = ["tenant", "kind"] as const;

export const parseOzonArgs = (
  args: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): OzonScriptArgs => {
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
    tenant: values.tenant ?? env.OZON_TENANT ?? null,
    kind: values.kind ?? env.OZON_KIND ?? null,
    fixtures: flags.has("fixtures") || env.OZON_FIXTURES === "1",
    flags,
  };
};
