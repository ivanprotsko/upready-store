/**
 * A keyword router behind `ModelProvider`, for a stand with no model key and
 * for the fixture run. It picks one tool from the words of the question and
 * reads the tool's answer back as is. It is no language model: it exists so
 * the voice loop and the tools can be shown and tested without one.
 */
import { type Command, commandForPhrase } from "../commands/index.ts";
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

const wordsOf = (text: string): string[] => fold(text).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);

/** A map command's arguments from the phrase: the order number, and the product words left after the command's own. */
function commandCall(command: Command, text: string): ToolCall {
  const input: Record<string, unknown> = { id: command.id };
  const path = command.target.kind === "route" ? command.target.path : "";
  const number = /\d{3,}/.exec(text)?.[0];
  if (number && path.startsWith("/tenants/orders/{id}")) input.order = number;
  if (path.startsWith("/tenants/products/{id}")) {
    const own = command.aliases.flatMap(wordsOf).map((w) => w.slice(0, 5));
    const rest = (productPhrase(text) ?? "").split(" ").filter((w) => w && !own.includes(w.slice(0, 5)) && !/^(сним|сня|опублик|верн|переве|черн|товар)/.test(w));
    if (rest.length) input.product = rest.join(" ");
    if (command.id === "products.update" && /опублику/.test(text) && !/сним|снят/.test(text)) input.body = { status: "published" };
  }
  return { id: `rules-run_command-${command.id}`, name: "run_command", input };
}

/** Words that ask for a change: the phrase then names a write the owner will confirm. */
const WRITE = /сними|снять|опублику|черновик|создай|создать|выгрузи|собери|отметь|добавь|измени|поправ|правк|экспорт/;

function route(text: string): ToolCall | null {
  // ё reads as е here, so «мумиё» and «мумие» route alike and the stop words match both spellings.
  const t = fold(text);
  const call = (name: string, input: Record<string, unknown>): ToolCall => ({ id: `rules-${name}`, name, input });
  const product = productPhrase(t);
  const period = /сегодня/.test(t) ? "today" : /месяц|30 дн/.test(t) ? "30d" : "7d";

  if (/отзыв/.test(t)) return call("product_reviews", { ...(product ? { query: product } : {}), ...(/плох|негатив/.test(t) ? { max_rating: 3 } : {}) });
  if (/продал|продаж|выручк|заработ|средн\S* чек/.test(t)) return call("sales_summary", { period });
  // A command of the map named by its name or alias: «список акций», «возвраты», «способы оплаты».
  const command = commandForPhrase(t, ["read"]);
  if (command) return commandCall(command, t);
  if (/заказ/.test(t)) return call("recent_orders", { days: period === "today" ? 1 : period === "30d" ? 30 : 7 });
  if (product && /остат|склад|осталось|налич/.test(t)) return call("product_stock", { query: product });
  if (product && /открой|открыть|карточк|ссылк/.test(t)) return call("open_product", { query: product });
  if (product && /цен|стои|почем|найди|товар/.test(t)) return call("find_products", { query: product });
  return null;
}

/**
 * Stage 3 phrases, read before the command map: the owner's «публикуй» and
 * «откати» on their own (not «опубликуй тройчатку», which is a product's
 * status), «что изменено», a picture to draw or to put on the site, and a
 * product's new name.
 */
export function stage3Call(text: string): ToolCall | null {
  const t = fold(text).trim().replace(/[.!?]+$/, "");
  const call = (name: string, input: Record<string, unknown>): ToolCall => ({ id: `rules-${name}`, name, input });
  if (/^(о|за)?публику\S*(\s+(\S+\s+)?(изменени\S*|правк\S*|вс[её]|это|последн\S*|на (сайт|main|основн\S*)))*$/.test(t)) return call("prepare_publish", {});
  if (/^(откат\S*|откати\S*|верни (как было|назад|обратно))(\s+\S+){0,3}$/.test(t)) return call("prepare_rollback", {});
  if (/что (изменен|изменил|поменял|меняли|менял)|последние изменени|список изменени|какие изменени|история изменени/.test(t)) return call("list_changesets", {});
  // A photo: «убери фон», «выровняй свет», «обработай фото», with or without a page link.
  const link = /https:\/\/[^\s<>"«»]+/i.exec(text)?.[0]?.replace(/[.,;)]+$/, "");
  const photoOp = /убер\S*\s+(?:с\s+(?:этого\s+)?(?:фото|снимка|картинки)\s+)?фон|удал\S*\s+фон|без фона|вырежи/.test(t) ? "remove-bg" : /выровня\S*\s+свет|выравни\S*\s+свет|исправ\S*\s+свет|поправ\S*\s+свет|свет.{0,20}выров/.test(t) ? "even-light" : null;
  const photoAsk = /обработ\S*\s+(это\s+)?(фото|снимок|картинк\S*)|(фото|снимок)\s+обработ/.test(t);
  if (link && (photoOp || photoAsk || /фото|картинк/.test(t))) return call("find_page_photos", { url: link, ...(photoOp ? { op: photoOp } : {}) });
  // «убери фон на втором», «выбери второе»: a number or an ordinal inside the sentence picks from the page's pictures.
  const WORDS = ["перв", "втор", "трет", "четв", "пят", "шест"];
  const inside = /(?:на|фото|номер|№|вариант|выбери|возьми|бери)\s*([1-6])(?!\d)|(?:^|\s)(перв|втор|трет|четв[её]рт|пят|шест)\S*/.exec(t);
  const nth = inside ? (inside[1] ? Number(inside[1]) : WORDS.findIndex((w) => inside[2]!.startsWith(w)) + 1) : 0;
  if (nth && (photoOp || /^(выбери|возьми|бери|давай)\b/.test(t))) return call("pick_photo", { n: nth, ...(photoOp ? { op: photoOp } : {}) });
  if (photoOp || photoAsk) return call("edit_photo", photoOp ? { op: photoOp } : {});
  const pick = /^(?:(?:номер|фото|картинк\S*|вариант)\s*)?([1-6])(?:\s*(?:е|-?е|-?й|-?ое))?$/.exec(t);
  if (pick) return call("pick_photo", { n: Number(pick[1]) });
  const ordinal = /^(перв|втор|трет|четв[её]рт|пят|шест)\S*(\s+(фото|картинк\S*|вариант))?$/.exec(t);
  if (ordinal) return call("pick_photo", { n: ["перв", "втор", "трет", "четв", "пят", "шест"].findIndex((w) => ordinal[1]!.startsWith(w)) + 1 });
  const draw = /^(нарисуй|сгенерируй|сделай картинку|создай картинку|сделай изображение|создай изображение|картинк\S* для)\s*:?\s*(.*)$/.exec(t);
  // The prompt in the owner's own case: `t` is `text` folded, letter for letter, with the same end stripped.
  const raw = text.trim().replace(/[.!?]+$/, "");
  if (draw) return call("generate_image", { prompt: raw.slice(raw.length - draw[2]!.length) || "баннер магазина" });
  const place = /^(поставь|поставить|помести|повесь)\s+(\S+\s+)?(на|в)\s+(баннер|товар)\s*(.*)$/.exec(t);
  if (place) {
    if (place[4] === "баннер") return call("place_image", { target: "banner", ...(/\d/.test(place[5]!) ? { banner: Number(/\d+/.exec(place[5]!)![0]) } : {}) });
    return call("place_image", { target: "product", product: place[5]!.replace(/^[«"]|[»"]$/g, "") });
  }
  // Case-blind: a transcript starts with a capital letter; the new title keeps the owner's own case.
  const rename = /^(переименуй|поменяй название|измени название)\s+(товара?\s+)?(.+?)\s+(в|на)\s+(.+)$/i.exec(text.trim().replace(/[.!?]+$/, ""));
  if (rename) {
    return {
      id: "rules-run_command-products.update",
      name: "run_command",
      input: { id: "products.update", product: rename[3]!.replace(/^[«"]|[»"]$/g, ""), body: { title: rename[5]!.replace(/^[«"]|[»"]$/g, "") } },
    };
  }
  return null;
}

const READ_ONLY = "Я только читаю данные магазина и ничего в нём не меняю. Это можно сделать в панели.";
export { READ_ONLY };

const HELP =
  "Я могу назвать продажи за сегодня, неделю или месяц, последние заказы, остатки и цены товара, " +
  "отзывы покупателей, акции, возвраты, резервы, баннеры и способы оплаты, открыть товар в панели " +
  "и подготовить изменение, например снять товар с публикации или переименовать его. Изменение идёт на stage; " +
  "«публикуй» переносит его на сайт, «откати» возвращает. Ещё могу нарисовать картинку и прочитать PDF. " +
  "Спросите, например: «сколько мы продали за неделю?»";

export class RulesProvider implements ModelProvider {
  readonly name = "rules (keyword router, no model)";

  async next(request: ModelRequest): Promise<ModelStep> {
    const last: ChatMessage | undefined = request.messages.at(-1);
    if (last?.role === "tool") return { kind: "text", text: last.results.map((r) => r.content).join("\n") };
    if (last?.role !== "user") return { kind: "text", text: HELP };
    const text = fold(last.text);
    const stage3 = stage3Call(last.text);
    if (stage3) return { kind: "tools", text: "", calls: [stage3] };
    // Deleting, canceling and money stay in the panel; they are never proposed.
    if (/удал|отмени|верни деньги|спиши/.test(text)) return { kind: "text", text: READ_ONLY };
    // The map's aliases are infinitives: «сними» is said, «снять» is written.
    const write = WRITE.test(text) ? commandForPhrase(text.replace(/сними/g, "снять"), ["propose"]) : null;
    if (write) return { kind: "tools", text: "", calls: [commandCall(write, text)] };
    if (/измени|поменя|создай|добавь/.test(text)) return { kind: "text", text: READ_ONLY };
    const call = route(last.text);
    return call ? { kind: "tools", text: "", calls: [call] } : { kind: "text", text: HELP };
  }
}
