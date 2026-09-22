/**
 * Backend's own copy of the composition vocabulary and FORBIDDEN pairs the storefront
 * keeps at `apps/storefront/src/lib/theme/composition.ts`. Hand-transcribed from
 * `artifacts/docs/2026-09-09-composition-contract.json` independently on each side —
 * there is no shared package between the two apps to import a single copy from
 * (`pnpm-workspace.yaml` lists only `apps/**`). This is the one check that truly
 * cannot be skipped (`panel-composition-mockup.md` §C7): the popover greys an option
 * live and the storefront proxy re-checks the assembled document, but only this
 * server-side check is not bypassable by a client that never asked.
 *
 * Keep this file's enums and FORBIDDEN array in sync with the storefront's
 * `composition.ts` by hand whenever the contract JSON changes; `composition.test.ts`
 * on the storefront side asserts its own copy against the contract JSON, and this
 * file's own tests (backend `jest`, out of this package's scope — flagged, not built
 * here) should do the same.
 */

export type StorefrontSettingsInput = {
  defaultMode: "light" | "dark";
  header: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  hero: "none" | "g" | "h" | "j" | "k" | "l" | "m" | "ga" | "gb";
  tiles: "on" | "off";
  listing: "none" | "p1" | "p2" | "p3" | "p4" | "p5";
  footer: "none" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7";
};

export type StorefrontSettings = StorefrontSettingsInput & { updatedAt: string };

export const SCHEMA_ID = "upready.storefront-settings/v1";

const ENUMS: Record<keyof StorefrontSettingsInput, readonly string[]> = {
  defaultMode: ["light", "dark"],
  header: ["h1", "h2", "h3", "h4", "h5", "h6"],
  hero: ["none", "g", "h", "j", "k", "l", "m", "ga", "gb"],
  tiles: ["on", "off"],
  listing: ["none", "p1", "p2", "p3", "p4", "p5"],
  footer: ["none", "f1", "f2", "f3", "f4", "f5", "f6", "f7"],
};

export type ForbiddenRule = {
  field: keyof StorefrontSettingsInput;
  value: string;
  against: keyof StorefrontSettingsInput;
  againstValue: string;
  reason: string;
};

/** `composition-contract.json`'s `validity` array, `type: "forbidden"` entries only. */
export const FORBIDDEN: readonly ForbiddenRule[] = [
  {
    field: "header",
    value: "h4",
    against: "hero",
    againstValue: "k",
    reason:
      "Header Accent and hero Announcement both fill their bar with the accent, nothing between.",
  },
  {
    field: "footer",
    value: "f6",
    against: "defaultMode",
    againstValue: "dark",
    reason:
      "Footer Inverted giant wordmark turns light on a dark page — reads as detached, not a foundation.",
  },
];

export function isForbidden(next: StorefrontSettingsInput): ForbiddenRule | null {
  for (const rule of FORBIDDEN) {
    if (next[rule.field] === rule.value && next[rule.against] === rule.againstValue) {
      return rule;
    }
  }
  return null;
}

export type FieldError = { field: string; message: string };

/** Field-level validation only — every slot present, a string, a member of its enum. */
export function validateFields(input: unknown): FieldError[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "_root", message: "Body must be a JSON object." }];
  }
  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const field of Object.keys(ENUMS) as (keyof StorefrontSettingsInput)[]) {
    const value = body[field];
    const allowed = ENUMS[field];
    if (typeof value !== "string" || !allowed.includes(value)) {
      errors.push({ field, message: `${field} must be one of: ${allowed.join(", ")}.` });
    }
  }
  return errors;
}

export type ValidationResult =
  | { ok: true; value: StorefrontSettingsInput }
  | { ok: false; kind: "invalid_field"; errors: FieldError[] }
  | { ok: false; kind: "forbidden_combination"; rule: ForbiddenRule };

export function validate(input: unknown): ValidationResult {
  const errors = validateFields(input);
  if (errors.length > 0) return { ok: false, kind: "invalid_field", errors };
  const value = input as StorefrontSettingsInput;
  const forbidden = isForbidden(value);
  if (forbidden) return { ok: false, kind: "forbidden_combination", rule: forbidden };
  return { ok: true, value };
}
