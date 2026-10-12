import type { PropsResult } from "../types"

/**
 * The icons a template may name, by string (BLOCK-CONTRACT.md §3). A closed list: a shop's
 * delivery, payment, trust and catalogue marks. `BlockIcon` (`./block-icon.tsx`) draws each with
 * its lucide-react component; a name missing there fails the type check, a name missing here
 * fails the template.
 */
export const BLOCK_ICON_NAMES = [
  // delivery
  "truck",
  "package",
  "map-pin",
  "store",
  "clock",
  // payment
  "credit-card",
  "wallet",
  "qr-code",
  "banknote",
  // trust
  "shield-check",
  "badge-check",
  "rotate-ccw",
  "award",
  "star",
  "heart",
  "leaf",
  "gift",
  "percent",
  "phone",
  "message-circle",
  "mail",
  "send",
  // catalogue
  "tag",
  "shopping-bag",
  "ruler",
  "sparkles",
  "flame",
] as const

export type BlockIconName = (typeof BLOCK_ICON_NAMES)[number]

const NAMES = new Set<string>(BLOCK_ICON_NAMES)

/** One name of `BLOCK_ICON_NAMES`. Absent is `fallback`, else an error. */
export function parseIcon(
  value: unknown,
  path: string,
  { fallback }: { fallback?: BlockIconName } = {}
): PropsResult<BlockIconName> {
  if ((value === undefined || value === null) && fallback) return { ok: true, value: fallback }
  return typeof value === "string" && NAMES.has(value)
    ? { ok: true, value: value as BlockIconName }
    : { ok: false, errors: [`${path} must be an icon of shared/icon-name.ts, e.g. truck, credit-card, shield-check`] }
}
