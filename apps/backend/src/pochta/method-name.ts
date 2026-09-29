/**
 * The name the checkout shows for the Russian Post option, kept apart from the
 * shop's other options (t-2026-09-30-01).
 *
 * A shop that used to charge Russian Post by hand often has a manual option
 * named exactly like ours, «Почта России — до отделения». Provisioning the
 * integrated option under the same name put two identical cards in the
 * checkout, one priced by the shop and one by the carrier. So provisioning
 * takes the first name nobody else uses, and the panel names the manual twin
 * to its owner with a switch to turn it off.
 */

/** The names the integrated option tries, in this order. */
export const POCHTA_METHOD_NAMES = ["Почта России — до отделения", "Почта России — пункт выдачи"] as const;

/** Two names a buyer cannot tell apart compare equal: case, spacing and the kind of dash do not count. */
export const nameKey = (name: string): string =>
  name
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/[‐-―−-]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

/** The first of `POCHTA_METHOD_NAMES` no other option of the shop carries, else the first one numbered. */
export const freePochtaMethodName = (otherNames: string[]): string => {
  const taken = new Set(otherNames.map(nameKey));
  const free = POCHTA_METHOD_NAMES.find((name) => !taken.has(nameKey(name)));
  if (free) return free;
  for (let n = 2; ; n += 1) {
    const candidate = `${POCHTA_METHOD_NAMES[0]} (${n})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
};

/**
 * The names provisioning writes: the name a new option gets, and a new name
 * for an existing Russian Post option that shares its name with another
 * option (one provisioned before this rule existed).
 */
export const planPochtaOptionNames = (
  mine: Array<{ id: string; name: string }>,
  otherNames: string[],
): { create_name: string; renames: Record<string, string> } => {
  const taken = new Set(otherNames.map(nameKey));
  const free = freePochtaMethodName(otherNames);
  const renames: Record<string, string> = {};
  for (const option of mine) {
    if (taken.has(nameKey(option.name))) renames[option.id] = free;
  }
  return { create_name: free, renames };
};

/**
 * The shop's other options a buyer would take for the Russian Post one: shown
 * in the checkout, and named like it or like any name it may carry.
 */
export const duplicatesOfPochtaMethod = <T extends { name: string; enabled: boolean }>(
  pochtaName: string | null,
  others: T[],
): T[] => {
  const keys = new Set([...(pochtaName ? [pochtaName] : []), ...POCHTA_METHOD_NAMES].map(nameKey));
  return others.filter((option) => option.enabled && keys.has(nameKey(option.name)));
};
