import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import type MarketplaceModuleService from "./service";

/**
 * One review or question of a marketplace in the shape the panel shows, and
 * the shop product behind it (w18-mp-reviews-desk, moved into the module by
 * mp-section-design task-05).
 *
 * READ-ONLY TOWARDS THE MARKETPLACE. Nothing in this file, and nothing in the
 * routes that use it, opens a socket to Wildberries or Ozon: the rows come
 * from the normalized `mp_review` / `mp_question` tables the projector fills
 * (`project.ts`), and the only write the screen can do is into `answer_draft`
 * of our own database (`api/tenants/marketplaces/draft-handlers.ts`). Ivan's
 * order of 2026-09-16 02:46 WITA stands: `POST /api/v1/feedbacks/answer` (WB)
 * and `/v1/review/comment/create`, `/v1/question/answer/create` (Ozon) are on
 * the mutation deny-lists, cannot be registered as reads, and no handler here
 * names them. `api/tenants/marketplaces/__tests__/reviews-desk-read-only.unit.spec.ts`
 * checks that by reading these files rather than by trusting this paragraph.
 *
 * WHY ONE SHAPE FOR TWO TABLES. A review and a question differ by two columns
 * (`rating`, `text`/`pros`/`cons` against `question_text`) and by nothing
 * else: same tenant scoping, same link to the shop catalog, same draft. The
 * list of «Wildberries → Отзывы» shows both in one table (`reviews-list.ts`),
 * and two copies of the mapping would drift the day one of them gets a fix
 * (rule 20).
 */

/** The two tables behind the screen, named as the panel's `kind` filter names them. */
export const DESK_KINDS = ["reviews", "questions"] as const;
export type DeskKind = (typeof DESK_KINDS)[number];

/**
 * One row of either table, as the module service returns it.
 *
 * The four review-only columns are OPTIONAL rather than nullable, because a
 * question row does not carry them at all and typing them as `number | null`
 * would let a reader think a question has a rating that happens to be empty.
 * That difference is exactly what the compiler caught when this type was
 * written the lazy way.
 */
export type DeskRow = {
  id: string;
  marketplace: string;
  external_id: string;
  vendor_code: string | null;
  author: string | null;
  created_at_mp: Date | string | null;
  is_answered: boolean;
  answer_draft: string | null;
  answer_draft_at: Date | string | null;
  /** Reviews only. */
  rating?: number | null;
  text?: string | null;
  pros?: string | null;
  cons?: string | null;
  /** Questions only. */
  question_text?: string | null;
};

export const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asIso = (value: Date | string | null | undefined): string | null => {
  const date = asDate(value);
  return date ? date.toISOString() : null;
};

/**
 * The shop product behind one marketplace row, or the honest absence of one.
 *
 * The chain is `vendor_code -> mp_product -> mp_link -> product`: a review
 * carries the article, the card carries the marketplace id, and `mp_link` is
 * where the matcher wrote which product of the shop that card is (spec 2.4).
 * Every step can miss, and each miss is a different sentence on the screen:
 * no article at all, an article no imported card carries, a card the matcher
 * has not linked. All three render as «нет в магазине» with the card's own
 * title next to it when there is one.
 */
export type ProductLink = {
  vendor_code: string | null;
  /** The card's title ON the marketplace, when the card is imported. */
  mp_title: string | null;
  mp_external_id: string | null;
  /** The shop's product, when the matcher linked that card. */
  product_id: string | null;
  product_title: string | null;
  linked: boolean;
};

export type ProductResolver = (marketplace: string, vendorCode: string | null) => ProductLink;

export const buildProductResolver = async (
  scope: MedusaContainer,
  mp: MarketplaceModuleService,
  tenantId: string,
): Promise<ProductResolver> => {
  const [cards, links] = await Promise.all([
    mp.listMpProducts({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpLinks({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
  ]);

  const cardByArticle = new Map<string, { external_id: string; title: string | null }>();
  for (const card of cards) {
    const vendorCode = card.vendor_code ? String(card.vendor_code) : null;
    if (!vendorCode) {
      continue;
    }
    const key = `${String(card.marketplace)}|${vendorCode}`;
    if (!cardByArticle.has(key)) {
      cardByArticle.set(key, {
        external_id: String(card.external_id),
        title: card.title ? String(card.title) : null,
      });
    }
  }

  const productByCard = new Map<string, string>(
    links.map((link) => [
      `${String(link.marketplace)}|${String(link.external_id)}`,
      String(link.product_id),
    ]),
  );

  const productIds = [...new Set(productByCard.values())];
  const titleById = new Map<string, string>();

  if (productIds.length) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title"],
      filters: { id: productIds },
    });
    for (const product of (data ?? []) as { id: string; title: string | null }[]) {
      titleById.set(product.id, product.title ?? "");
    }
  }

  return (marketplace, vendorCode) => {
    const card = vendorCode ? cardByArticle.get(`${marketplace}|${vendorCode}`) : undefined;
    const productId = card ? (productByCard.get(`${marketplace}|${card.external_id}`) ?? null) : null;

    return {
      vendor_code: vendorCode,
      mp_title: card?.title ?? null,
      mp_external_id: card?.external_id ?? null,
      product_id: productId,
      product_title: productId ? (titleById.get(productId) ?? null) : null,
      linked: Boolean(productId),
    };
  };
};

export type DeskItem = {
  id: string;
  kind: DeskKind;
  marketplace: string;
  external_id: string;
  rating: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  author: string | null;
  created_at: string | null;
  /** What the MARKETPLACE says about an answer, never our draft. */
  is_answered: boolean;
  answer_draft: string | null;
  answer_draft_at: string | null;
  product: ProductLink;
};

/**
 * Why the screen has no «отправить», in one sentence. It is in the payload
 * rather than only in the UI copy so that anyone reading the API sees the
 * same statement the owner does.
 */
export const sendingReason = (label: string): string =>
  `Черновик хранится только у нас: с ${label} платформа работает лишь на чтение, ` +
  `поэтому опубликовать ответ покупателю можно в личном кабинете ${label}.`;

export const toDeskItem = (row: DeskRow, kind: DeskKind, product: ProductLink): DeskItem => ({
  id: row.id,
  kind,
  marketplace: row.marketplace,
  external_id: row.external_id,
  rating: kind === "reviews" ? (row.rating ?? null) : null,
  text: kind === "reviews" ? (row.text ?? null) : (row.question_text ?? null),
  pros: kind === "reviews" ? (row.pros ?? null) : null,
  cons: kind === "reviews" ? (row.cons ?? null) : null,
  author: row.author ?? null,
  created_at: asIso(row.created_at_mp),
  is_answered: Boolean(row.is_answered),
  answer_draft: row.answer_draft ?? null,
  answer_draft_at: asIso(row.answer_draft_at),
  product,
});
