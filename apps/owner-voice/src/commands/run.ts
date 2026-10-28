/**
 * Running a map command, the way chrxnasdmds `admin_action` does it:
 *
 *   - read (a GET route): runs at once through the GET-only shop client, and
 *     the answer is cut to a few allow-listed fields with personal data gone;
 *   - write: never runs. It becomes a proposal the owner confirms, and on this
 *     stand the confirm is a dry-run: it shows the exact request (method, URL,
 *     body) and sends nothing, because the stand reads the live shop;
 *   - goto: a link into the tenant panel;
 *   - none: destructive, financial or with no target, never given to the agent.
 */
import { randomUUID } from "node:crypto";

import { scrub } from "../pii.ts";
import type { Query } from "../shop/api.ts";
import { fold, matchesQuery } from "../shop/fixtures.ts";
import { type Card, money, type ToolContext, type ToolOutcome } from "../tools.ts";
import { type Command, commandById, fillPath, panelHref, pathParams, RISK_RU } from "./index.ts";

type Row = Record<string, unknown>;

/** A proposal waits this long for the owner's confirm (t27-02: five minutes). */
export const PROPOSAL_TTL_MS = 5 * 60_000;

export interface Proposal {
  id: string;
  command: string;
  label: string;
  request: { method: string; url: string; body: unknown };
  expiresAt: number;
}

export class ProposalStore {
  readonly #items = new Map<string, Proposal>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  add(command: Command, request: Proposal["request"]): Proposal {
    for (const [id, p] of this.#items) if (p.expiresAt <= this.#now()) this.#items.delete(id);
    const proposal = { id: randomUUID(), command: command.id, label: command.label_ru, request, expiresAt: this.#now() + PROPOSAL_TTL_MS };
    this.#items.set(proposal.id, proposal);
    return proposal;
  }

  /** The proposal, once: a confirmed or expired one is gone. */
  take(id: string): Proposal | null {
    const proposal = this.#items.get(id) ?? null;
    this.#items.delete(id);
    return proposal && proposal.expiresAt > this.#now() ? proposal : null;
  }
}

export interface DryRun {
  dryRun: true;
  sent: false;
  command: string;
  request: Proposal["request"];
  card: Card;
}

/** The owner's confirm on this stand: the request as it would leave, and nothing leaves. */
export function confirmProposal(store: ProposalStore, id: string): DryRun | null {
  const proposal = store.take(id);
  if (!proposal) return null;
  const { method, url, body } = proposal.request;
  return {
    dryRun: true,
    sent: false,
    command: proposal.command,
    request: proposal.request,
    card: {
      kind: "dryrun",
      title: `Dry-run: ${proposal.label}`,
      rows: [`${method} ${url}`, `Тело: ${JSON.stringify(body)}`, "Не отправлено: стенд читает живой магазин и ничего в него не пишет."],
      request: proposal.request,
    },
  };
}

export interface CommandInput {
  /** Path parameters by name, e.g. `{ id: "prod_…" }`. */
  params?: Record<string, unknown> | undefined;
  /** A proposal's body; the map's `body` when absent. */
  body?: Record<string, unknown> | undefined;
  /** A product by name, for a `{id}` of `/tenants/products/{id}`. */
  product?: string | undefined;
  /** An order by its number, for a `{id}` of `/tenants/orders/{id}`. */
  order?: string | number | undefined;
  /** Search words for a list. */
  q?: string | undefined;
  limit?: number | undefined;
}

const LABEL_KEYS = ["display_id", "code", "title", "name", "label", "handle", "sku", "change_type", "action", "id"];
const DETAIL: Record<string, string> = {
  status: "статус",
  type: "тип",
  payment_status: "оплата",
  fulfillment_status: "отгрузка",
  quantity: "кол-во",
  stocked_quantity: "на складе",
  reserved_quantity: "в резерве",
  is_automatic: "автоматическая",
  price_type: "цена",
  total: "сумма",
  created_at: "создан",
};

const WORDS: Record<string, string> = {
  pending: "в работе", completed: "выполнен", canceled: "отменён", archived: "в архиве", draft: "черновик",
  published: "опубликован", proposed: "на проверке", rejected: "отклонён", active: "активна", inactive: "выключена",
  not_paid: "не оплачен", captured: "оплачен", authorized: "оплата авторизована", awaiting: "ждёт оплаты",
  not_fulfilled: "не собран", fulfilled: "собран", shipped: "отправлен", delivered: "доставлен",
  standard: "обычная", buyget: "купи и получи", flat: "фиксированная", calculated: "по расчёту", true: "да", false: "нет",
};

const date = (iso: string): string =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" });

function label(row: Row): string {
  const own = (key: string) => {
    const value = row[key];
    return typeof value === "string" || typeof value === "number" ? (key === "display_id" ? `№${value}` : String(value)) : null;
  };
  for (const key of LABEL_KEYS.slice(0, -1)) {
    const value = own(key);
    if (value) return value;
  }
  // A nested record names a row better than its own id: a reservation by its item.
  for (const key of ["item", "inventory_item", "product"]) {
    const inner = row[key] as Row | undefined;
    if (inner && typeof inner.title === "string") return inner.title;
  }
  return own("id") ?? "запись";
}

function line(row: Row): string {
  const parts: string[] = [];
  for (const [key, word] of Object.entries(DETAIL)) {
    const value = row[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "total" && typeof value === "number") parts.push(`${word} ${money(value, String(row.currency_code ?? "rub"))}`);
    else if (key === "created_at" && typeof value === "string") parts.push(`${word} ${date(value)}`);
    else if (typeof value !== "object") parts.push(`${word}: ${WORDS[String(value)] ?? value}`);
  }
  return parts.length ? `${label(row)} — ${parts.join(", ")}` : label(row);
}

const firstArray = (body: Row): [string, Row[]] | null => {
  for (const [key, value] of Object.entries(body)) if (Array.isArray(value)) return [key, value as Row[]];
  return null;
};
const firstObject = (body: Row): Row | null => {
  for (const value of Object.values(body)) if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  return null;
};

const MAX_ROWS = 8;

/** The answer as rows of allow-listed fields: what the card shows and the model reads. */
export function summarize(command: Command, raw: unknown): { head: string; rows: string[] } {
  const body = scrub(raw) as Row;
  if (command.id === "payment_methods.list") {
    const methods = (body.methods ?? {}) as Row;
    const on = Object.entries(methods).filter(([, v]) => v === true).map(([k]) => k);
    const off = Object.entries(methods).filter(([, v]) => v === false).map(([k]) => k);
    return { head: `Способов оплаты включено: ${on.length}`, rows: [`Включены: ${on.join(", ") || "нет"}`, `Выключены: ${off.join(", ") || "нет"}`] };
  }
  if (command.id === "home_banners.list") {
    const home = (body.home ?? null) as Row | null;
    const banners = (((home?.content as Row | undefined)?.banners ?? []) as Row[]).slice(0, MAX_ROWS);
    return {
      head: `Баннеров на главной: ${banners.length}`,
      rows: banners.map((b) => `${typeof b.title === "string" && b.title ? b.title : (b.label ?? b.id)}${b.button ? ` — кнопка «${b.button}»` : ""}`),
    };
  }
  const list = firstArray(body);
  if (list) {
    const [, rows] = list;
    const total = typeof body.count === "number" ? body.count : rows.length;
    return { head: `${command.label_ru}: ${total}`, rows: rows.slice(0, MAX_ROWS).map(line) };
  }
  const item = firstObject(body);
  if (item) {
    const rows = [line(item)];
    for (const [key, value] of Object.entries(item)) {
      if (Array.isArray(value) && value.length) rows.push(`${key}: ${value.length}`);
    }
    return { head: command.label_ru, rows };
  }
  return { head: command.label_ru, rows: ["Пустой ответ."] };
}

/** `{id}` of a product or an order, found by its name or number. */
async function resolveId(command: Command, input: CommandInput, ctx: ToolContext): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { ...(input.params ?? {}) };
  if (command.target.kind !== "route" || params.id) return params;
  const path = command.target.path;
  if (path.startsWith("/tenants/products/{id}") && input.product) {
    const regionId = await ctx.shop.regionId();
    const body = (await ctx.shop.store("/store/products", { q: fold(input.product).slice(0, 5), limit: 20, fields: "id,title,handle", region_id: regionId ?? undefined })) as {
      products?: Row[];
    };
    const found = (body.products ?? []).find((p) => matchesQuery(`${p.title} ${p.handle}`, input.product!));
    if (found) {
      params.id = found.id;
      params._name = found.title;
    }
  }
  if (path.startsWith("/tenants/orders/{id}") && input.order !== undefined) {
    const number = String(input.order).replace(/\D/g, "");
    const body = (await ctx.shop.owner("/tenants/orders", { limit: 50, order: "-created_at", fields: "id,display_id" })) as { orders?: Row[] };
    const found = (body.orders ?? []).find((o) => String(o.display_id) === number);
    if (found) {
      params.id = found.id;
      params._name = `заказ №${number}`;
    }
  }
  return params;
}

const linkCard = (command: Command, href: string | null, rows: string[]): Card => ({
  title: command.label_ru,
  rows,
  ...(href ? { link: { label: "Открыть в панели", href } } : {}),
});

/** One command for the chat, the palette and the agent. */
export async function runCommand(id: string, input: CommandInput, ctx: ToolContext): Promise<ToolOutcome & { proposal?: Proposal }> {
  const command = commandById(id);
  if (!command) return { text: `Команды ${id} нет.` };
  const params = await resolveId(command, input, ctx);
  const href = panelHref(command, ctx.panelUrl, params);

  if (command.agent === "none") {
    const why =
      command.risk === "destructive" || command.risk === "financial"
        ? `это ${RISK_RU[command.risk] === "деньги" ? "движение денег" : "необратимое действие"}, его делают в панели`
        : command.target.kind === "missing"
          ? `в магазине этого пока нет (${command.target.reason})`
          : (command.note ?? "агенту не выдано");
    return { text: `«${command.label_ru}» я не выполняю: ${why}.`, card: linkCard(command, href, [`Не выдано агенту: ${why}.`]) };
  }

  if (command.agent === "goto") {
    if (!href) return { text: `Для «${command.label_ru}» в панели нет страницы.` };
    return { text: `«${command.label_ru}» — в панели, ссылка на экране.`, card: linkCard(command, href, [href]) };
  }

  if (command.target.kind !== "route") return { text: `У «${command.label_ru}» нет маршрута.` };
  const path = fillPath(command.target.path, params);
  if (!path) {
    const need = pathParams(command.target.path).filter((p) => !params[p]);
    const hint = !need.includes("id") ? "" : command.target.path.startsWith("/tenants/products/{id}") ? " Назовите товар." : command.target.path.startsWith("/tenants/orders/{id}") ? " Назовите номер заказа." : "";
    return { text: `Для «${command.label_ru}» не хватает: ${need.join(", ")}.${hint}`, card: linkCard(command, href, [`Нужно: ${need.join(", ")}`]) };
  }

  if (command.agent === "read") {
    const query: Query = { limit: Math.min(Math.max(Number(input.limit) || 10, 1), 50), q: input.q || undefined };
    // A single record takes no list parameters.
    const body = await ctx.shop.owner(path, pathParams(command.target.path).length ? {} : query);
    const { head, rows } = summarize(command, body);
    const shown = rows.length ? rows : ["Пусто."];
    return {
      text: `${head}.\n${shown.join("\n")}${command.note ? `\n(${command.note})` : ""}`,
      card: { kind: "result", title: head, rows: shown, ...(href ? { link: { label: "Открыть в панели", href } } : {}) },
    };
  }

  // propose: a write, drafted and held for the owner; nothing is sent here.
  if (!ctx.proposals) return { text: "Изменения на этом стенде выключены." };
  const body = input.body ?? command.body ?? {};
  const request = { method: command.target.method, url: `${ctx.apiUrl ?? ""}${path}`, body };
  const proposal = ctx.proposals.add(command, request);
  const what = typeof params._name === "string" ? ` для «${params._name}»` : "";
  return {
    text: `Подготовил «${command.label_ru}»${what}. Нужна ваша кнопка «Подтвердить»; на этом стенде запрос только покажется и не уйдёт.`,
    card: {
      kind: "proposal",
      title: `Предложение: ${command.label_ru}${what}`,
      rows: [`${request.method} ${request.url}`, `Тело: ${JSON.stringify(body)}`, `Риск: ${RISK_RU[command.risk]}. Ждёт подтверждения 5 минут.`],
      proposalId: proposal.id,
      request,
      ...(href ? { link: { label: "Открыть в панели", href } } : {}),
    },
    proposal,
  };
}
