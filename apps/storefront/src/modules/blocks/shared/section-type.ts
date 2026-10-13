/**
 * The type of a section's header (t-2026-10-12-33, BLOCK-CONTRACT.md §3): one class string per role, so the
 * shell's header (`block-section.tsx`) and every block that draws its own heading (`text/rich-text`) set a
 * section in one scale, and a template's page has one size per role (QR-TYPE-ROLE).
 *
 * The numbers are rich-text's, which pass `pnpm template:check` (the lab's QR rules): 12 / 16 / 16 / 24 px at
 * 360 (eyebrow, see-all, description, heading) and 12 / 14 / 18 / 32 px from `small`, so neighbouring sizes
 * stand ≥ 1.15× apart (QR-TYPE-SCALE) and the heading ÷ the description ≥ 1.5 (QR-SECTION-RANK). The see-all
 * link was 14 px at every width; next to a 16 px description that is 1.14, so it reads 16 px below `small`.
 * The storefront's `text-3xl` is 2rem with no line height of its own, hence `leading-tight`: 32/40.
 *
 * Only the type lives here; colour of the link, layout and spacing stay with whoever draws them.
 */
export const SECTION_TYPE = {
  /** The eyebrow, `data-role="label"`: capitals only at 12 px and tracked (QR-CASE). */
  label: "text-xs font-medium uppercase tracking-widest text-ui-fg-muted",
  /** The section title, an `h2` with `data-role="heading"`. */
  heading: "text-balance text-2xl font-semibold leading-tight tracking-[-0.02em] text-ui-fg-base small:text-3xl",
  /** The description under the title, `data-role="description"`. */
  description: "text-pretty text-base text-ui-fg-subtle small:text-lg",
  /** The «see all» link's size and weight. */
  seeAll: "text-base font-medium small:text-sm",
} as const
