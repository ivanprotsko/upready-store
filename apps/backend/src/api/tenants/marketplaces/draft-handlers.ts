import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../modules/marketplace";
import type MarketplaceModuleService from "../../../modules/marketplace/service";
import { describeGenerator, generateDraft } from "../../../modules/marketplace/draft-generator";
import { getTenantScope } from "../tenant-scope";
import { buildProductResolver, type DeskKind, type DeskRow } from "./desk";

/**
 * The draft half of the desk (w18-mp-reviews-desk): write it, clear it,
 * generate one.
 *
 * EVERY WRITE HERE IS INTO OUR OWN DATABASE. The columns are
 * `mp_review.answer_draft` / `mp_question.answer_draft` and their
 * `answer_draft_at`, the tables the projector owns. There is no send, no
 * queue, no scheduled send and no marketplace call of any kind on this path —
 * answering on the marketplace is `POST /api/v1/feedbacks/answer` (WB) and
 * `/v1/review/comment/create`, `/v1/question/answer/create` (Ozon), all three
 * on the mutation deny-lists and unregistrable as reads.
 *
 * `is_answered` is NOT touched by saving a draft. That column says what the
 * MARKETPLACE reports, and setting it because the owner wrote something in our
 * panel would turn a fact into a wish: the «без ответа» filter would then stop
 * showing exactly the rows that still need an answer over there (rule 20a).
 */

/** Our own limit, not a marketplace's: long enough for any real answer. */
export const DRAFT_MAX_LENGTH = 5000;

const notFound = (kind: DeskKind, id: string) =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `${kind === "reviews" ? "Отзыв" : "Вопрос"} ${id} у этого магазина не найден.`,
  );

const loadRow = async (
  req: AuthenticatedMedusaRequest,
  kind: DeskKind,
): Promise<{ mp: MarketplaceModuleService; row: DeskRow }> => {
  const tenant = await getTenantScope(req);
  const id = String(req.params.id ?? "");
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  /**
   * The tenant is part of the FILTER, never checked after the fact: a row of
   * another shop has to be missing, not forbidden, so the answer never tells
   * one shop that another shop's row exists (`tenant-scope.ts`).
   */
  const filter = { id, tenant_id: tenant.id };
  const rows = (
    kind === "reviews" ? await mp.listMpReviews(filter) : await mp.listMpQuestions(filter)
  ) as DeskRow[];

  const row = rows[0];
  if (!row) {
    throw notFound(kind, id);
  }

  return { mp, row };
};

const asDraftText = (body: unknown): string => {
  const value = (body as { answer_draft?: unknown } | null)?.answer_draft;

  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Поле answer_draft должно быть строкой.",
    );
  }
  if (value.length > DRAFT_MAX_LENGTH) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Черновик длиннее ${DRAFT_MAX_LENGTH} символов — столько мы не храним.`,
    );
  }
  return value;
};

const asItem = (row: DeskRow, kind: DeskKind) => ({
  id: row.id,
  kind,
  answer_draft: row.answer_draft ?? null,
  answer_draft_at:
    row.answer_draft_at instanceof Date
      ? row.answer_draft_at.toISOString()
      : (row.answer_draft_at ?? null),
  is_answered: Boolean(row.is_answered),
});

/**
 * `POST /tenants/marketplaces/{reviews|questions}/:id/draft`.
 *
 * An empty body CLEARS the draft: the owner deleting her text means she wants
 * it gone, and keeping a stale `answer_draft_at` next to an empty draft would
 * be a timestamp for something that no longer exists.
 */
export const saveDraft = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  kind: DeskKind,
) => {
  const { mp, row } = await loadRow(req, kind);
  const text = asDraftText(req.body).trim();
  const empty = text.length === 0;

  const update = {
    id: row.id,
    answer_draft: empty ? null : text,
    answer_draft_at: empty ? null : new Date(),
  };

  const [saved] = (await (kind === "reviews"
    ? mp.updateMpReviews([update])
    : mp.updateMpQuestions([update]))) as unknown as DeskRow[];

  res.json({ item: asItem(saved ?? { ...row, ...update }, kind) });
};

/**
 * `POST /tenants/marketplaces/{reviews|questions}/:id/suggest`.
 *
 * Returns text. It does NOT save it, and it does not send it anywhere: the
 * owner reads what the template wrote, edits it and presses «Сохранить
 * черновик» herself. A generator that saved its own output would put words
 * into her drafts she never read.
 *
 * With no generator configured this answers 400 with the same sentence the
 * disabled button already carries, so a client that ignores the flag gets the
 * reason rather than an empty draft.
 */
export const suggestDraft = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  kind: DeskKind,
) => {
  const generator = describeGenerator();

  if (!generator.available) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, generator.reason);
  }

  const { mp, row } = await loadRow(req, kind);

  /**
   * The product title comes from the same chain the list uses
   * (`vendor_code -> mp_product -> mp_link -> product`), so a draft names the
   * товар the row is about only when the screen can name it too.
   */
  const resolve = await buildProductResolver(req.scope, mp, (await getTenantScope(req)).id);
  const product = resolve(row.marketplace, row.vendor_code ?? null);

  const draft = generateDraft({
    kind,
    rating: row.rating ?? null,
    text: kind === "reviews" ? (row.text ?? null) : (row.question_text ?? null),
    pros: row.pros ?? null,
    cons: row.cons ?? null,
    author: row.author ?? null,
    product_title: product.product_title ?? product.mp_title,
  });

  res.json({ draft, generator });
};
