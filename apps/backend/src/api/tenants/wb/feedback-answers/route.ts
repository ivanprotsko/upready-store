import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../../../../modules/marketplace-write";
import type MarketplaceWriteModuleService from "../../../../modules/marketplace-write/service";
import { WB_MODULE } from "../../../../modules/wb";
import { ensureDefaultAnswerTemplates } from "../../../../modules/wb/answer-templates";
import type WbModuleService from "../../../../modules/wb/service";
import {
  answerTextSha256,
  WB_ANSWER_MAX_CHARS,
  WB_ANSWER_MIN_CHARS,
} from "../../../../modules/wb-write/feedback-answers";
import {
  WB_MARKETPLACE,
  WB_UNREGISTERED_MUTATIONS,
  WB_WRITE_ENDPOINTS,
} from "../../../../modules/wb-write/write-endpoints";
import { inspectWbWriteCredential, WB_WRITE_LIVE_ENV } from "../../../../modules/wb-write/write-transport";
import { readWildberriesWriteSecret } from "../../../../tenant-secrets/wildberries";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantWbFeedbackAnswerBodyType } from "./validators";

/**
 * `GET/PUT /tenants/wb/feedback-answers` — the «Отзывы и вопросы» tab
 * (w22-wb-write-feedback-answers).
 *
 * GET hands the panel everything one screen needs and nothing it would have to
 * assemble itself: the mirrored reviews and questions with their drafts, the
 * templates, the state of the `feedback_answers` consent and of the three
 * gates the owner cannot set. PUT writes ONE column, `draft_answer`, on ONE
 * row of ONE tenant. Neither verb can reach Wildberries: the dispatch lives in
 * `send/route.ts`, behind the write core.
 *
 * Unanswered first, newest first within that, because the owner's question
 * about this screen is "what is waiting for me" — the same ordering `tables`
 * uses for questions (w03).
 *
 * Scoping: `getTenantScope` resolves the tenant from the token, and every
 * query below filters on it plus `deleted_at is null`. An id in the body only
 * ever NARROWS that set, which is why a foreign id reads as a missing row.
 */

/** How many of each kind the tab loads. The filter, not the scrollbar, is the tool. */
const ROW_LIMIT = 50;

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const answeredFilter = (query: unknown): boolean | null => {
  const value = typeof query === "string" ? query : null;
  if (value === "answered") {
    return true;
  }
  if (value === "unanswered") {
    return false;
  }
  return null;
};

type FeedbackRow = {
  id: string;
  feedback_id: string;
  nm_id: string | null;
  product_valuation: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  user_name: string | null;
  is_answered: boolean;
  created_date: Date | string | null;
  draft_answer: string | null;
  answer_status: string;
  answer_sha256: string | null;
  answer_confirmed_by: string | null;
  answer_confirmed_at: Date | string | null;
  answer_error: string | null;
};

type QuestionRow = {
  id: string;
  question_id: string;
  nm_id: string | null;
  product_name: string | null;
  supplier_article: string | null;
  text: string | null;
  answer_text: string | null;
  is_answered: boolean;
  was_viewed: boolean | null;
  created_date: Date | string | null;
  draft_answer: string | null;
  answer_status: string;
  answer_sha256: string | null;
  answer_confirmed_by: string | null;
  answer_confirmed_at: Date | string | null;
  answer_error: string | null;
};

/**
 * The name the panel shows for the item being answered. A review carries no
 * product title in WB's payload, only `nmID`, so the vendor code comes from
 * the product mirror when it is there and the row says `nm_id` when it is not
 * — never a blank cell whose meaning the reader has to guess (rule 20a).
 */
const productNamesByNmId = async (
  pg: Knex,
  tenantId: string,
  nmIds: string[],
): Promise<Map<string, { title: string | null; vendor_code: string | null }>> => {
  const unique = [...new Set(nmIds.filter((value): value is string => Boolean(value)))];
  if (!unique.length) {
    return new Map();
  }

  const rows = (await pg("wb_product")
    .where({ tenant_id: tenantId })
    .whereNull("deleted_at")
    .whereIn("nm_id", unique)
    .select("nm_id", "title", "vendor_code")) as Array<{
    nm_id: string;
    title: string | null;
    vendor_code: string | null;
  }>;

  return new Map(rows.map((row) => [row.nm_id, { title: row.title, vendor_code: row.vendor_code }]));
};

const readState = async (req: AuthenticatedMedusaRequest) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const wb = req.scope.resolve<WbModuleService>(WB_MODULE);
  const writeService = req.scope.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);

  // A shop that opens this tab for the first time gets its three Russian
  // defaults here and never again: the seed is by slug, so an edited or a
  // deleted-and-rewritten template is left alone.
  await ensureDefaultAnswerTemplates(wb, tenant.id);

  const wantAnswered = answeredFilter(req.query.answered);

  const feedbackQuery = pg("wb_feedback")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at");
  const questionQuery = pg("wb_question").where({ tenant_id: tenant.id }).whereNull("deleted_at");

  if (wantAnswered !== null) {
    void feedbackQuery.where("is_answered", wantAnswered);
    void questionQuery.where("is_answered", wantAnswered);
  }

  const feedbackRows = (await feedbackQuery
    .clone()
    .orderBy([
      { column: "is_answered", order: "asc" },
      { column: "created_date", order: "desc" },
    ])
    .limit(ROW_LIMIT)
    .select(
      "id",
      "feedback_id",
      "nm_id",
      "product_valuation",
      "text",
      "pros",
      "cons",
      "user_name",
      "is_answered",
      "created_date",
      "draft_answer",
      "answer_status",
      "answer_sha256",
      "answer_confirmed_by",
      "answer_confirmed_at",
      "answer_error",
    )) as FeedbackRow[];

  const questionRows = (await questionQuery
    .clone()
    .orderBy([
      { column: "is_answered", order: "asc" },
      { column: "created_date", order: "desc" },
    ])
    .limit(ROW_LIMIT)
    .select(
      "id",
      "question_id",
      "nm_id",
      "product_name",
      "supplier_article",
      "text",
      "answer_text",
      "is_answered",
      "was_viewed",
      "created_date",
      "draft_answer",
      "answer_status",
      "answer_sha256",
      "answer_confirmed_by",
      "answer_confirmed_at",
      "answer_error",
    )) as QuestionRow[];

  // The counts are over the WHOLE mirror, not over the page: "3 из 50" would
  // be a fact about the limit, and the owner is asking about her shop.
  const feedbackCounts = await pg("wb_feedback")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .select(
      pg.raw("count(*) filter (where is_answered = false)::int as unanswered"),
      pg.raw("count(*) filter (where is_answered = true)::int as answered"),
      pg.raw("count(*) filter (where draft_answer is not null and draft_answer <> '')::int as drafts"),
    )
    .first();

  const questionCounts = await pg("wb_question")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .select(
      pg.raw("count(*) filter (where is_answered = false)::int as unanswered"),
      pg.raw("count(*) filter (where is_answered = true)::int as answered"),
      pg.raw("count(*) filter (where draft_answer is not null and draft_answer <> '')::int as drafts"),
    )
    .first();

  const products = await productNamesByNmId(
    pg,
    tenant.id,
    [...feedbackRows, ...questionRows].map((row) => row.nm_id ?? ""),
  );

  const templates = (await wb.listWbAnswerTemplates(
    { tenant_id: tenant.id },
    { order: { sort_order: "ASC" } },
  )) as Array<{
    id: string;
    slug: string;
    title: string;
    body: string;
    target: string;
    sort_order: number;
    is_builtin: boolean;
  }>;

  const [consent] = (await writeService.listMarketplaceWriteConsents({
    tenant_id: tenant.id,
    marketplace: WB_MARKETPLACE,
    op_class: "feedback_answers",
  })) as Array<{ confirmed_by: string; confirmed_at: Date | string; note: string | null }>;

  const [setting] = (await writeService.listMarketplaceWriteSettings({
    tenant_id: tenant.id,
    marketplace: WB_MARKETPLACE,
  })) as Array<{ is_enabled: boolean }>;

  const audit = (await writeService.listMarketplaceWriteAudits(
    { tenant_id: tenant.id, marketplace: WB_MARKETPLACE, op_class: "feedback_answers" },
    { order: { created_at: "DESC" }, take: 20 },
  )) as Array<{
    id: string;
    endpoint_id: string;
    method: string;
    path: string;
    payload_sha256: string;
    dry_run: boolean;
    outcome: string;
    gate: string | null;
    actor: string;
    status: number | null;
    error: string | null;
    created_at: Date | string;
  }>;

  const secret = await readWildberriesWriteSecret(pg, tenant.id, { includeDisabled: true });
  const facts = secret ? inspectWbWriteCredential(secret.credentials) : null;

  return {
    marketplace: WB_MARKETPLACE,
    op_class: "feedback_answers",
    limits: { min_chars: WB_ANSWER_MIN_CHARS, max_chars: WB_ANSWER_MAX_CHARS, row_limit: ROW_LIMIT },
    /**
     * The three gates that are not the owner's, reported so the screen can say
     * what will happen BEFORE she presses anything: today every dispatch is a
     * dry run and the tab says so in words rather than after the fact.
     */
    gates: {
      credential: { usable: facts?.usable ?? false, reason: facts?.usable === false ? (facts.reason ?? null) : null },
      live: { env_var: WB_WRITE_LIVE_ENV, enabled: process.env[WB_WRITE_LIVE_ENV] === "1" },
      enabled: setting?.is_enabled ?? false,
      consent: consent
        ? { confirmed_by: consent.confirmed_by, confirmed_at: asIso(consent.confirmed_at), note: consent.note }
        : null,
    },
    /** The mutations of this class that exist at all, and the one that does not. */
    endpoints: WB_WRITE_ENDPOINTS.filter((entry) => entry.opClass === "feedback_answers").map(
      (entry) => ({
        id: entry.id,
        method: entry.method,
        host: entry.host,
        path: entry.path,
        summary: entry.summary,
        doc_url: entry.docUrl,
      }),
    ),
    unregistered: WB_UNREGISTERED_MUTATIONS.filter((entry) => entry.opClass === "feedback_answers").map(
      (entry) => ({
        what: entry.what,
        method: entry.method,
        path: entry.path,
        doc_url: entry.docUrl,
        reason: entry.reason,
      }),
    ),
    templates: templates.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      body: row.body,
      target: row.target,
      is_builtin: row.is_builtin,
    })),
    feedbacks: {
      unanswered: Number(feedbackCounts?.unanswered ?? 0),
      answered: Number(feedbackCounts?.answered ?? 0),
      drafts: Number(feedbackCounts?.drafts ?? 0),
      rows: feedbackRows.map((row) => {
        const product = row.nm_id ? products.get(row.nm_id) : undefined;
        return {
          target: "feedback" as const,
          id: row.feedback_id,
          nm_id: row.nm_id,
          product_title: product?.title ?? null,
          vendor_code: product?.vendor_code ?? null,
          rating: row.product_valuation,
          text: row.text,
          pros: row.pros,
          cons: row.cons,
          user_name: row.user_name,
          is_answered: row.is_answered,
          was_viewed: null,
          created_date: asIso(row.created_date),
          draft_answer: row.draft_answer,
          /** Recomputed, so the panel never has to hash the draft to press send. */
          draft_sha256: row.draft_answer?.trim() ? answerTextSha256(row.draft_answer.trim()) : null,
          answer_status: row.answer_status,
          answer_confirmed_by: row.answer_confirmed_by,
          answer_confirmed_at: asIso(row.answer_confirmed_at),
          answer_error: row.answer_error,
          answer_text: null,
        };
      }),
    },
    questions: {
      unanswered: Number(questionCounts?.unanswered ?? 0),
      answered: Number(questionCounts?.answered ?? 0),
      drafts: Number(questionCounts?.drafts ?? 0),
      rows: questionRows.map((row) => {
        const product = row.nm_id ? products.get(row.nm_id) : undefined;
        return {
          target: "question" as const,
          id: row.question_id,
          nm_id: row.nm_id,
          product_title: row.product_name ?? product?.title ?? null,
          vendor_code: row.supplier_article ?? product?.vendor_code ?? null,
          rating: null,
          text: row.text,
          pros: null,
          cons: null,
          user_name: null,
          is_answered: row.is_answered,
          was_viewed: row.was_viewed,
          created_date: asIso(row.created_date),
          draft_answer: row.draft_answer,
          draft_sha256: row.draft_answer?.trim() ? answerTextSha256(row.draft_answer.trim()) : null,
          answer_status: row.answer_status,
          answer_confirmed_by: row.answer_confirmed_by,
          answer_confirmed_at: asIso(row.answer_confirmed_at),
          answer_error: row.answer_error,
          answer_text: row.answer_text,
        };
      }),
    },
    audit: audit.map((row) => ({
      id: row.id,
      endpoint_id: row.endpoint_id,
      method: row.method,
      path: row.path,
      payload_sha256: row.payload_sha256,
      dry_run: row.dry_run,
      outcome: row.outcome,
      gate: row.gate,
      actor: row.actor,
      status: row.status,
      error: row.error,
      created_at: asIso(row.created_at),
    })),
  };
};

/** Exported so `send/route.ts` answers with the same shape after a dispatch. */
export const readFeedbackAnswersState = readState;

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await readState(req));
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantWbFeedbackAnswerBodyType>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const table = body.target === "feedback" ? "wb_feedback" : "wb_question";
  const idColumn = body.target === "feedback" ? "feedback_id" : "question_id";
  const draft = body.draft_answer.trim();

  /**
   * Editing the draft ALWAYS drops the confirmation with it. Keeping the old
   * `answer_sha256` next to a new text would leave a row that says "confirmed"
   * about words nobody read — the gate in `send/route.ts` would catch it, and
   * the screen would still have lied in the meantime.
   */
  const updated = await pg(table)
    .where({ tenant_id: tenant.id, [idColumn]: body.id })
    .whereNull("deleted_at")
    .update({
      draft_answer: draft.length ? draft : null,
      answer_status: "draft",
      answer_sha256: null,
      answer_confirmed_by: null,
      answer_confirmed_at: null,
      answer_error: null,
      updated_at: new Date(),
    });

  // A foreign id is a missing id: the response never says another shop's row
  // exists (`tenant-scope.ts`).
  if (!updated) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No mirrored ${body.target} ${body.id} for this shop.`,
    );
  }

  res.json(await readState(req));
};
