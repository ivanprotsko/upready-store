import { z } from "@medusajs/framework/zod";

/**
 * The platform's public pricing page (`/pricing` on the platform hosts) as ONE
 * validated document — t-2026-09-25-08, the first stage of t-2026-09-14-04
 * «Pricing manager».
 *
 * This schema is the only definition of the page. The admin write
 * (`POST /admin/platform-pricing`) validates the body with it, and the public
 * read (`GET /platform/pricing`) parses the stored row with it again before it
 * answers, so a row that drifted from the schema fails loud on the read instead
 * of reaching the storefront half-valid.
 *
 * Why a document and not tables: the page is edited as a whole on one admin
 * screen, its ORDER is content (tiers, sections, rows, chips, card features),
 * and every comparison row must carry exactly one value per tier. In one
 * document that invariant is a single refinement below; across normalized
 * tables it would be seven tables, their sort columns and a transaction that
 * rewrites all of them on every save. Later stages of t-2026-09-14-04 extend
 * the tier object (a machine price for the calculator, a billing period) and
 * bump `schema_version`; the stable tier `id` is what they key on.
 *
 * Two kinds of text, exactly as the source HTML treats them:
 *   - tier, section, row, chip and tooltip texts are typographed by the
 *     storefront (non-breaking spaces after short words, before a dash and in
 *     digit groups), the way the HTML's own `typo()` does, so they are stored
 *     with plain spaces;
 *   - page texts (hero, value blocks, the two explainers, the final block) are
 *     stored as written, non-breaking spaces included, and rendered as they
 *     are. They accept two marks: `**bold**` and a line break `\n`.
 */

export const PRICING_SCHEMA_VERSION = 1;

/** Icons the storefront can draw (`apps/storefront/src/app/pricing/icons.tsx`). */
export const PRICING_ICONS = ["box", "gear", "globe", "shield", "guard", "card", "check"] as const;
export type PricingIcon = (typeof PRICING_ICONS)[number];

/**
 * What a button does (Ivan's 4.1.1). Only `link` leaves the funnel; the other
 * four enter `/start` with the tariff. There is NO payment provider behind
 * `pay_first` and `card_trial` yet (t-2026-09-25-06): both land in the demo
 * till, and the storefront says so. `onboarding_trial` (t-2026-09-27-05,
 * order o-20260921-01 answer 3b) is the paid tiers' trial WITHOUT a card: it
 * skips the till and goes straight into the wizard, carrying the trial length
 * the way `card_trial` does.
 */
export const BUTTON_ACTIONS = ["link", "onboarding_free", "pay_first", "card_trial", "onboarding_trial"] as const;
export type ButtonActionType = (typeof BUTTON_ACTIONS)[number];

export const TRIAL_DAYS_MIN = 1;
export const TRIAL_DAYS_MAX = 365;

export const TIER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * An anchor on the page, a path on the same site, or an absolute http(s),
 * mailto or tel address. Everything else, `javascript:` first of all, is
 * refused: this string ends up in an `href`.
 */
export function isAllowedHref(href: string): boolean {
  return /^(#|\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(href);
}

const label = (max: number) => z.string().min(1).max(max);
const text = (max: number) => z.string().max(max);

export const ButtonActionSchema = z.discriminatedUnion("type", [
  // What the address may be is checked in `PricingDocumentSchema` below, where
  // the path of the button is known and goes into the message.
  z.strictObject({ type: z.literal("link"), href: z.string().min(1).max(500) }),
  z.strictObject({ type: z.literal("onboarding_free") }),
  z.strictObject({ type: z.literal("pay_first") }),
  z.strictObject({
    type: z.literal("card_trial"),
    trial_days: z.number().int().min(TRIAL_DAYS_MIN).max(TRIAL_DAYS_MAX),
  }),
  z.strictObject({
    type: z.literal("onboarding_trial"),
    trial_days: z.number().int().min(TRIAL_DAYS_MIN).max(TRIAL_DAYS_MAX),
  }),
]);
export type ButtonAction = z.infer<typeof ButtonActionSchema>;

export const ButtonSchema = z.strictObject({
  label: label(80),
  style: z.enum(["solid", "outline"]),
  action: ButtonActionSchema,
});
export type PricingButton = z.infer<typeof ButtonSchema>;

export const TierFeatureSchema = z.strictObject({
  text: label(200),
  /** The drawer text behind a dashed underline; empty means no drawer. */
  tip: text(1000),
  /**
   * A footnote marker printed next to the value (the landing's superscript
   * ¹²³⁴); empty means none. The footnote's own text lives in `tip` — the
   * landing carries no separate footnote list (t-2026-09-27-05).
   */
  note: text(4).default(""),
});

/** One billing period's price of a tier, as the landing shows it. */
export const TierPriceSchema = z.strictObject({
  amount: label(30),
  period: text(30),
  note: text(120),
});
export type TierPrice = z.infer<typeof TierPriceSchema>;

export const TierSchema = z.strictObject({
  /** Stable slug, carried into `/start` as `?tariff=`. Never shown. */
  id: z.string().min(1).max(40).regex(TIER_ID_RE, "id: lowercase letters, digits and single hyphens"),
  name: label(60),
  /** The mobile tab label when the name is too long for it; empty = the name. */
  short_name: text(20),
  /** The headline price (monthly billing) and the text next to it, e.g. "699 ₽" + "в месяц". */
  price: label(60),
  price_note: text(120),
  /**
   * The same tier billed yearly, when the landing shows a different figure for
   * it (t-2026-09-27-05); null when a tier bills the same regardless of period
   * (the free tier). Not rendered on `/pricing` today — kept so the landing's
   * yearly price is not dropped from the document (Ivan's 7a).
   */
  price_annual: TierPriceSchema.nullable().default(null),
  recommended: z.boolean(),
  description: text(300),
  /** «Входит в «Старт»:», «Всё из «Старта», плюс:». */
  plus: text(120),
  features: z.array(TierFeatureSchema).max(30),
  button: ButtonSchema,
  /**
   * The tier's own trial length, the single source of truth `/start/onboarding`
   * resolves against (t-2026-09-27-05): null for a tier with no trial (the free
   * tier). A button's own `card_trial`/`onboarding_trial.trial_days` is what it
   * links with; this is what the wizard's server route stores on the tenant, and
   * it never trusts the URL for it.
   */
  trial_days: z.number().int().min(TRIAL_DAYS_MIN).max(TRIAL_DAYS_MAX).nullable().default(null),
});
export type PricingTier = z.infer<typeof TierSchema>;

export const CellValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("yes") }),
  z.strictObject({ type: z.literal("no") }),
  z.strictObject({ type: z.literal("text"), text: label(80) }),
]);
export type PricingCellValue = z.infer<typeof CellValueSchema>;

export const RowSchema = z.strictObject({
  feature: label(200),
  tip: text(1000),
  /** One value per tier, keyed by tier id (checked against `tiers` below). */
  values: z.record(z.string(), CellValueSchema),
});
export type PricingRow = z.infer<typeof RowSchema>;

export const SectionSchema = z.strictObject({
  icon: z.enum(PRICING_ICONS),
  eyebrow: label(120),
  heading: text(600),
  chips: z.array(label(60)).max(40),
  /** The last, muted chip («и другие с открытым API»); empty = none. */
  more_chip: text(80),
  rows: z.array(RowSchema).max(60),
});
export type PricingSection = z.infer<typeof SectionSchema>;

export const HighlightSchema = z.strictObject({
  icon: z.enum(PRICING_ICONS),
  label: label(120),
  text: text(400),
});

export const ExplainerSchema = z.strictObject({
  title: label(200),
  text: text(1000),
});

const PricingDocumentShape = z.strictObject({
  schema_version: z.literal(PRICING_SCHEMA_VERSION),
  page: z.strictObject({
    /** The browser tab title. */
    meta_title: label(120),
    eyebrow: text(60),
    title: label(200),
    note: text(300),
  }),
  highlights: z.array(HighlightSchema).max(6),
  /** The first column's header in the comparison table. */
  features_label: label(60),
  tiers: z.array(TierSchema).min(1).max(6),
  sections: z.array(SectionSchema).max(12),
  /** The side drawer a dashed-underlined feature opens. */
  drawer: z.strictObject({
    eyebrow: label(60),
    availability_label: label(60),
    yes_label: label(30),
    no_label: label(30),
    close_label: label(30),
  }),
  explainers: z.array(ExplainerSchema).max(4),
  final: z.strictObject({
    title: label(200),
    text: text(600),
    /**
     * The tariff the final button enters `/start` with. Required when its
     * action is not a plain link, because that button belongs to no card.
     */
    tier_id: z.string().nullable(),
    button: ButtonSchema,
  }),
});

/** Every page text that may carry `**bold**`, with its path for the error. */
function richTexts(doc: z.infer<typeof PricingDocumentShape>): Array<[string, string]> {
  return [
    ["page.title", doc.page.title],
    ["page.note", doc.page.note],
    ...doc.highlights.flatMap((h, i): Array<[string, string]> => [
      [`highlights.${i}.label`, h.label],
      [`highlights.${i}.text`, h.text],
    ]),
    ...doc.explainers.flatMap((e, i): Array<[string, string]> => [
      [`explainers.${i}.title`, e.title],
      [`explainers.${i}.text`, e.text],
    ]),
    ["final.title", doc.final.title],
    ["final.text", doc.final.text],
  ];
}

/**
 * Checks no single field can make on its own. Medusa's error formatter prints
 * a custom issue's message and not its path, so every message starts with the
 * path of the field it names.
 */
export const PricingDocumentSchema = PricingDocumentShape.superRefine((doc, ctx) => {
  const issue = (path: Array<string | number>, message: string) =>
    ctx.addIssue({ code: "custom", path, message: `${path.join(".")}: ${message}` });

  const tierIds = doc.tiers.map((t) => t.id);
  const known = new Set<string>();
  doc.tiers.forEach((tier, i) => {
    if (known.has(tier.id)) issue(["tiers", i, "id"], `duplicate tier id "${tier.id}"`);
    known.add(tier.id);
  });

  doc.sections.forEach((section, s) => {
    section.rows.forEach((row, r) => {
      for (const id of tierIds) {
        if (!(id in row.values)) {
          issue(["sections", s, "rows", r, "values", id], `no value for tier "${id}"`);
        }
      }
      for (const key of Object.keys(row.values)) {
        if (!known.has(key)) {
          issue(["sections", s, "rows", r, "values", key], `"${key}" is not a tier id`);
        }
      }
    });
  });

  const { tier_id, button } = doc.final;
  if (tier_id !== null && !known.has(tier_id)) {
    issue(["final", "tier_id"], `"${tier_id}" is not a tier id`);
  }
  if (button.action.type !== "link" && tier_id === null) {
    issue(["final", "tier_id"], `action "${button.action.type}" needs a tariff`);
  }

  const buttons: Array<[Array<string | number>, PricingButton]> = [
    ...doc.tiers.map((tier, i): [Array<string | number>, PricingButton] => [["tiers", i, "button"], tier.button]),
    [["final", "button"], doc.final.button],
  ];
  for (const [path, btn] of buttons) {
    if (btn.action.type === "link" && !isAllowedHref(btn.action.href)) {
      issue([...path, "action", "href"], "an #anchor, a /path or an http(s), mailto or tel address");
    }
  }

  for (const [path, value] of richTexts(doc)) {
    if ((value.match(/\*\*/g) ?? []).length % 2 !== 0) {
      issue(path.split("."), "unbalanced ** (bold) marks");
    }
  }
});

export type PricingDocument = z.infer<typeof PricingDocumentSchema>;

/** `POST /admin/platform-pricing`. `revision` is the one the editor loaded; null creates the page. */
export const PostAdminPlatformPricingSchema = z.strictObject({
  pricing: PricingDocumentSchema,
  revision: z.number().int().min(1).nullable(),
});
export type PostAdminPlatformPricingBody = z.infer<typeof PostAdminPlatformPricingSchema>;
