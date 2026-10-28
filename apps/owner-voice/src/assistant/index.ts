/**
 * The buyer assistant at `/assistant`: one turn of a visitor's chat.
 *
 * The visitor's text is masked before any model reads it (an email or phone
 * typed into the chat becomes «[email скрыт]»), and the tools reach only the
 * public catalog. The keyword router answers when no model key is set.
 */
import { runTurn, type ToolKit, type TurnResult } from "../agent.ts";
import type { ChatMessage, ModelProvider, ModelRequest, ModelStep, ToolCall } from "../model/types.ts";
import { maskBuyerText } from "../pii.ts";
import { fold } from "../shop/fixtures.ts";
import { categoryFor, PAGE_WORDS, runStoreTool, type StoreContext, storeToolSpecs } from "./tools.ts";

export function assistantPrompt(shopName: string): string {
  return [
    `Ты консультант интернет-магазина «${shopName}» и отвечаешь покупателю.`,
    "Отвечай по-русски, коротко и дружелюбно, 1–3 предложения.",
    "Цены, наличие и факты о товарах бери только из инструментов, ничего не придумывай.",
    "Не обещай лечебного действия и не ставь диагнозов: по здоровью советуй обратиться к врачу.",
    "Про заказы, оплату конкретного заказа и личные данные не отвечай: попроси написать магазину через страницу контактов.",
    "Не проси у покупателя имя, телефон, почту или адрес.",
  ].join("\n");
}

const STOP = new Set(
  (
    "есть ли у вас а и в на по о об про что какой какая какие сколько стоит стоят цена цену почем это мне нужно хочу " +
    "купить найти найди покажи посоветуйте посоветуй подскажите подскажи расскажите расскажи пожалуйста привет здравствуйте " +
    "наличии товар товары для от из с что-нибудь можно ли такое такой мой моя мое мои вот"
  ).split(" "),
);

const phrase = (text: string): string | null => {
  // A masked contact («[телефон скрыт]») is not part of what the buyer looks for.
  const words = fold(text.replace(/\[[^\]]*\]/g, " ")).split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 2 && !STOP.has(w));
  return words.length ? words.join(" ") : null;
};

const HELP =
  "Я подскажу по товарам магазина: найду товар, назову цену и наличие, покажу разделы каталога, " +
  "расскажу об условиях доставки, оплаты и возврата. Спросите, например: «есть ли свечи от варикоза?»";

const NOT_HERE = "Про заказы и личные данные я не отвечаю. Напишите магазину через страницу «Контакты», там помогут.";

/** The assistant's keyword router, for a stand with no model key. */
export class AssistantRules implements ModelProvider {
  readonly name = "rules (assistant keyword router, no model)";
  readonly #ctx: StoreContext;

  constructor(ctx: StoreContext) {
    this.#ctx = ctx;
  }

  async next(request: ModelRequest): Promise<ModelStep> {
    const last: ChatMessage | undefined = request.messages.at(-1);
    if (last?.role === "tool") return { kind: "text", text: last.results.map((r) => r.content).join("\n") };
    if (last?.role !== "user") return { kind: "text", text: HELP };
    const t = fold(last.text);
    const call = (name: string, input: Record<string, unknown>): ModelStep => ({
      kind: "tools",
      text: "",
      calls: [{ id: `rules-${name}`, name, input } satisfies ToolCall],
    });
    if (/мой заказ|моего заказа|номер заказа|где заказ|статус заказа|трек/.test(t)) return { kind: "text", text: NOT_HERE };
    for (const [words, key] of PAGE_WORDS) if (words.test(t)) return call("info_page", { key });
    if (/раздел|категор|каталог|ассортимент/.test(t) && !phrase(t.replace(/раздел\S*|категор\S*|каталог\S*|ассортимент\S*/g, ""))) {
      return call("list_categories", {});
    }
    const category = await categoryFor(this.#ctx, t).catch(() => null);
    if (category && /раздел|категор|что есть|какие|покажи/.test(t)) return call("category_products", { category: String(category.name) });
    const product = phrase(t);
    if (product && /что такое|расскаж|описан|состав|как принимать|чем полез|подробн|налич|осталось|стоит|цена|почем/.test(t)) {
      return call("product_info", { query: product });
    }
    if (product) return call("search_products", { query: product });
    return { kind: "text", text: HELP };
  }
}

export interface AssistantDeps {
  provider: ModelProvider;
  ctx: StoreContext;
  shopName: string;
}

/** One visitor turn. Their words reach the model masked; so does what they said before. */
export function assistantTurn(deps: AssistantDeps, history: ChatMessage[], question: string): Promise<TurnResult> {
  const kit: ToolKit<StoreContext> = { system: assistantPrompt(deps.shopName), specs: storeToolSpecs, run: runStoreTool };
  const masked = history.map((m) => (m.role === "user" || m.role === "assistant" ? { ...m, text: maskBuyerText(m.text) } : m));
  return runTurn(deps.provider, deps.ctx, deps.shopName, masked, maskBuyerText(question), kit);
}
