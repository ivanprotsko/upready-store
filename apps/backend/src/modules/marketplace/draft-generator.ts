/**
 * The OPTIONAL local generator of answer drafts (w18-mp-reviews-desk).
 *
 * THREE THINGS IT IS NOT. It is not a send: what it produces goes into
 * `mp_review.answer_draft` in our own database and nowhere else, and this
 * repository has no path to a marketplace answer method at all (both stand in
 * the adapters' mutation deny-lists). It is not a network call: the only
 * generator implemented here is a template, it runs in this process, and
 * nothing in this file reaches outside it. And it is not required: with no
 * generator configured the desk still lists, filters and saves drafts — the
 * «сгенерировать» button is DISABLED and carries the reason, which is a third
 * state and not a blank row (rule 19h).
 *
 * WHY AN ENV KNOB RATHER THAN «ALWAYS ON». Whether a shop wants a machine to
 * draft answers to its customers is the owner's decision, not ours, so the
 * generator is off until somebody turns it on:
 *
 *     MP_DRAFT_GENERATOR=template
 *
 * An unknown value is not silently treated as «off»: it answers «попросили X,
 * а есть только template», because a typo in a variable name is otherwise
 * indistinguishable from a deliberate «не нужно» (rule 20a).
 */

/** The generators this repository actually has. */
export const DRAFT_GENERATORS = ["template"] as const;
export type DraftGeneratorId = (typeof DRAFT_GENERATORS)[number];

export type GeneratorInfo = {
  /** Whether the «сгенерировать» button may be pressed at all. */
  available: boolean;
  id: DraftGeneratorId | null;
  /** One sentence in plain Russian, shown next to the button either way. */
  reason: string;
  /** Always false here, and stated rather than implied: nothing leaves this process. */
  remote: false;
};

const OFF_REASON =
  "Генератор черновиков выключен. Включите его переменной MP_DRAFT_GENERATOR=template " +
  "на бэкенде — он работает локально и в площадку ничего не отправляет.";

export const describeGenerator = (
  env: Record<string, string | undefined> = process.env,
): GeneratorInfo => {
  const wanted = (env.MP_DRAFT_GENERATOR ?? "").trim();

  if (!wanted || wanted === "off") {
    return { available: false, id: null, reason: OFF_REASON, remote: false };
  }

  if (!DRAFT_GENERATORS.includes(wanted as DraftGeneratorId)) {
    return {
      available: false,
      id: null,
      reason:
        `MP_DRAFT_GENERATOR=${wanted} — такого генератора в платформе нет. ` +
        `Есть: ${DRAFT_GENERATORS.join(", ")}.`,
      remote: false,
    };
  }

  return {
    available: true,
    id: wanted as DraftGeneratorId,
    reason:
      "Черновик составляет локальный шаблон по тексту отзыва. Он ничего не отправляет " +
      "на площадку и не сохраняется сам — отредактируйте и нажмите «Сохранить черновик».",
    remote: false,
  };
};

export type DraftSource = {
  kind: "reviews" | "questions";
  rating: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  author: string | null;
  product_title: string | null;
};

/** «Анонимный покупатель» has no name to greet, and neither has an empty string. */
const greeting = (author: string | null): string => {
  const name = (author ?? "").trim();
  return name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
};

/**
 * A draft, built from what the row actually says.
 *
 * It states nothing the shop has not said: where an answer needs a fact only
 * the owner has (what happened with this order, what the size really is), the
 * template leaves a MARKED gap rather than inventing a sentence the owner
 * would send to a customer under her own name. A plausible invention is the
 * one failure a draft generator must not have (rule 17a).
 */
export const generateDraft = (source: DraftSource): string => {
  const lines: string[] = [greeting(source.author)];
  const product = source.product_title ? ` «${source.product_title}»` : "";

  if (source.kind === "questions") {
    lines.push(
      `Спасибо за вопрос о товаре${product}. [ответьте здесь по существу вопроса]`,
      "Если нужно что-то уточнить — напишите нам, поможем с выбором.",
    );
    return lines.join("\n\n");
  }

  const rating = source.rating ?? null;

  if (rating !== null && rating <= 3) {
    lines.push(`Спасибо, что написали о товаре${product}. Жаль, что он вас разочаровал.`);
    if (source.cons?.trim()) {
      lines.push(`Вы отметили: «${source.cons.trim()}». [что мы с этим сделаем]`);
    } else {
      lines.push("[что именно пошло не так и что мы с этим сделаем]");
    }
    lines.push("Напишите нам в личные сообщения — разберёмся и поможем.");
    return lines.join("\n\n");
  }

  lines.push(`Спасибо за отзыв о товаре${product} и за оценку!`);
  if (source.pros?.trim()) {
    lines.push(`Рады, что вам понравилось: «${source.pros.trim()}».`);
  }
  if (source.cons?.trim()) {
    lines.push(`Про «${source.cons.trim()}» — [ответ владельца].`);
  }
  lines.push("Будем рады видеть вас снова.");

  return lines.join("\n\n");
};
