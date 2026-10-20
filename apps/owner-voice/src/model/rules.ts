/**
 * A keyword router behind `ModelProvider`, for a stand with no model key and
 * for the fixture run. It picks one tool from the words of the question and
 * reads the tool's answer back as is. It is no language model: it exists so
 * the voice loop and the tools can be shown and tested without one.
 */
import { fold } from "../shop/fixtures.ts";
import type { ChatMessage, ModelProvider, ModelRequest, ModelStep, ToolCall } from "./types.ts";

const STOP = new Set(
  (
    "сколько у нас на по о об про какой какая какие каких какое остаток остатки остатков складе склад осталось " +
    "цена цены цену стоит стоят открой открыть покажи показать найди найти товар товара товары товаров отзывы " +
    "отзывов отзыв плохие плохих хорошие хороших в наличии есть ли мне а и что с за это эту этот карточку ссылку " +
    "дай пожалуйста привет скажи расскажи по-моему почем"
  ).split(" "),
);

/** The words that name a product: what is left after the question words. */
export function productPhrase(text: string): string | null {
  const words = fold(text)
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return words.length ? words.join(" ") : null;
}

function route(text: string): ToolCall | null {
  // ё reads as е here, so «мумиё» and «мумие» route alike and the stop words match both spellings.
  const t = fold(text);
  const call = (name: string, input: Record<string, unknown>): ToolCall => ({ id: `rules-${name}`, name, input });
  const product = productPhrase(t);
  const period = /сегодня/.test(t) ? "today" : /месяц|30 дн/.test(t) ? "30d" : "7d";

  if (/отзыв/.test(t)) return call("product_reviews", { ...(product ? { query: product } : {}), ...(/плох|негатив/.test(t) ? { max_rating: 3 } : {}) });
  if (/продал|продаж|выручк|заработ|средн\S* чек/.test(t)) return call("sales_summary", { period });
  if (/заказ/.test(t)) return call("recent_orders", { days: period === "today" ? 1 : period === "30d" ? 30 : 7 });
  if (product && /остат|склад|осталось|налич/.test(t)) return call("product_stock", { query: product });
  if (product && /открой|открыть|карточк|ссылк/.test(t)) return call("open_product", { query: product });
  if (product && /цен|стои|почем|найди|товар/.test(t)) return call("find_products", { query: product });
  return null;
}

const READ_ONLY = "Я только читаю данные магазина и ничего в нём не меняю. Это можно сделать в панели.";

const HELP =
  "Я могу назвать продажи за сегодня, неделю или месяц, последние заказы, остатки и цены товара, " +
  "отзывы покупателей и открыть товар в панели. Спросите, например: «сколько мы продали за неделю?»";

export class RulesProvider implements ModelProvider {
  readonly name = "rules (keyword router, no model)";

  async next(request: ModelRequest): Promise<ModelStep> {
    const last: ChatMessage | undefined = request.messages.at(-1);
    if (last?.role === "tool") return { kind: "text", text: last.results.map((r) => r.content).join("\n") };
    if (last?.role !== "user") return { kind: "text", text: HELP };
    if (/удал|отмени|измени|поменя|создай|добавь|верни деньги|спиши/.test(last.text.toLowerCase())) {
      return { kind: "text", text: READ_ONLY };
    }
    const call = route(last.text);
    return call ? { kind: "tools", text: "", calls: [call] } : { kind: "text", text: HELP };
  }
}
