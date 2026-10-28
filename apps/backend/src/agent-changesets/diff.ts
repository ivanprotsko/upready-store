import type { OpKind } from "./allow-list";
import { pricesOf, type ChangesetOp, type OpValue } from "./ops";

/**
 * What an op leaves behind, in the shape `OP_SPECS[kind].project` reads its
 * target in, so the panel can lay `before` and `after` side by side field by
 * field (t-2026-10-27-04). It is the op's own body on top of `before`; the
 * route may still add what it computes itself (a page's footer default, a
 * resolved banner link), which the panel sees after publishing, not here.
 */
export const afterOf = (kind: OpKind, op: ChangesetOp, before: OpValue): OpValue => {
  const body = op.body ?? {};
  const base = before ?? {};

  switch (kind) {
    case "variant":
      return { ...base, prices: pricesOf(body.prices) };
    case "attributes": {
      const values = Array.isArray(body.values) ? body.values : [];
      return {
        ...base,
        ...Object.fromEntries(
          values
            .filter((entry): entry is { key: string; value: unknown } => typeof entry === "object" && entry !== null)
            .map((entry) => [String(entry.key), entry.value ?? null]),
        ),
      };
    }
    case "product": {
      const next: Record<string, unknown> = { ...base };
      for (const [key, value] of Object.entries(body)) {
        next[key] =
          key === "images" && Array.isArray(value)
            ? value.map((image) => ({ url: (image as { url?: unknown }).url }))
            : key === "categories" && Array.isArray(value)
              ? value.map((category) => ({ id: (category as { id?: unknown }).id }))
              : value;
      }
      return next;
    }
    default: {
      const { locale: _locale, slug: _slug, ...fields } = body;
      return { ...base, ...fields };
    }
  }
};

export type FieldChange = { field: string; before: unknown; after: unknown };

/** The fields whose value differs, in the order `after` lists them. */
export const changedFields = (before: OpValue, after: OpValue): FieldChange[] => {
  const left = before ?? {};
  const right = after ?? {};
  const fields = [...new Set([...Object.keys(right), ...Object.keys(left)])];
  return fields
    .filter((field) => JSON.stringify(left[field] ?? null) !== JSON.stringify(right[field] ?? null))
    .map((field) => ({ field, before: left[field] ?? null, after: right[field] ?? null }));
};
