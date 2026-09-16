import type WbModuleService from "./service";

/**
 * The three answer templates a shop starts with
 * (w22-wb-write-feedback-answers).
 *
 * Russian, because the shop's customers are Russian and WB shows the answer
 * verbatim under the review. They are ROWS, not constants: the owner is meant
 * to rewrite them in her own voice, and a constant would silently overwrite
 * that on the next deployment.
 *
 * Each one leaves the specific part to the owner rather than pretending to
 * know it: a template that fills in a phone number or a delivery date from
 * nowhere is how a wrong fact reaches a customer. What is bracketed is what
 * she has to replace before the confirmation dialog will let the text go.
 */
export type WbAnswerTemplateSeed = {
  slug: string;
  title: string;
  body: string;
  target: "feedback" | "question" | "both";
  sort_order: number;
};

export const WB_DEFAULT_ANSWER_TEMPLATES: readonly WbAnswerTemplateSeed[] = [
  {
    slug: "thanks",
    title: "Спасибо за отзыв",
    body:
      "Спасибо за отзыв! Нам очень приятно, что вещь вам подошла. " +
      "Будем рады видеть вас снова.",
    target: "feedback",
    sort_order: 10,
  },
  {
    slug: "apology-contact",
    title: "Извинение и контакт",
    body:
      "Извините, что так вышло. Нам важно разобраться: напишите нам, " +
      "пожалуйста, в чат Wildberries или на почту [ваша почта], " +
      "и мы решим вопрос — заменим товар или вернём деньги.",
    target: "feedback",
    sort_order: 20,
  },
  {
    slug: "composition",
    title: "Ответ на вопрос о составе",
    body:
      "Здравствуйте! Состав указан на бирке и в карточке товара: [состав]. " +
      "Если нужен точный состав по конкретному размеру — напишите, уточним.",
    target: "question",
    sort_order: 30,
  },
];

/**
 * Creates the defaults for a tenant that has none of them yet, and touches
 * nothing else. Called from the read route, so a shop that never opens the tab
 * never gets rows it did not ask for.
 *
 * Idempotent by SLUG rather than by count: a shop that deleted one default
 * gets it back and a shop that edited one keeps its edit (the row exists, so
 * nothing is written). The alternative — "seed when the table is empty" —
 * re-creates a deleted template only until the shop adds one of its own, which
 * is a rule nobody can predict from the screen.
 */
export const ensureDefaultAnswerTemplates = async (
  service: WbModuleService,
  tenantId: string,
): Promise<void> => {
  const existing = (await service.listWbAnswerTemplates({
    tenant_id: tenantId,
  })) as Array<{ slug: string }>;

  const have = new Set(existing.map((row) => row.slug));
  const missing = WB_DEFAULT_ANSWER_TEMPLATES.filter((seed) => !have.has(seed.slug));

  if (!missing.length) {
    return;
  }

  await service.createWbAnswerTemplates(
    missing.map((seed) => ({
      tenant_id: tenantId,
      slug: seed.slug,
      title: seed.title,
      body: seed.body,
      target: seed.target,
      sort_order: seed.sort_order,
      is_builtin: true,
    })),
  );
};
