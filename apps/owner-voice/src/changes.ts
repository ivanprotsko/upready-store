/**
 * Stage 3: a confirmed write becomes a changeset on the stage site, and
 * «публикуй» / «откати» move it to the live site or back.
 *
 *   confirm  → POST draft (the proposal's op) → POST stage → a card with the
 *              ops, the stage link and the status;
 *   публикуй → a confirm card (which changeset, what changes on main) → publish;
 *   откати   → a confirm card → rollback; on drift the card shows the diff and
 *              nothing was rolled back;
 *   что изменено → the last few changesets.
 *
 * Every refusal is the backend's: its code picks the Russian sentence, and the
 * backend's own words stay on the card under it.
 */
import type { Proposal } from "./commands/run.ts";
import { type Changeset, ChangesetError, type ChangesetClient, type ChangesetStatus, type OpView, type Sites } from "./shop/changesets.ts";
import type { Card, Tool, ToolOutcome } from "./tools.ts";

export const STATUS_RU: Record<ChangesetStatus, string> = {
  draft: "черновик",
  staged: "на stage",
  published: "на сайте",
  rolled_back: "откачено",
  discarded: "отменено",
};

const KIND_RU: Record<string, string> = {
  home: "главная",
  branding: "оформление",
  page: "страница",
  "page-create": "новая страница",
  article: "статья",
  "article-create": "новая статья",
  product: "товар",
  variant: "цена варианта",
  attributes: "характеристики",
};

const FIELD_RU: Record<string, string> = {
  title: "название",
  subtitle: "подзаголовок",
  description: "описание",
  thumbnail: "обложка",
  images: "фото",
  categories: "категории",
  content: "содержимое",
  settings: "настройки",
  theme: "тема",
  body: "текст",
  published: "опубликована",
  prices: "цены",
};

/** The backend's reasons (allow-list.ts, ops.ts) in the owner's words. */
const REASON_RU: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/orders, payments and returns/, "заказы, оплаты и возвраты агент не меняет"],
  [/buyers' personal data/, "данные покупателей агент не меняет"],
  [/address and domains/, "адрес и домены магазина решают Иван и lead-devops"],
  [/integration secret|marketplace key/, "ключи интеграций агент не трогает"],
  [/logins, roles and sites/, "логины, роли и сайты решает владелец"],
  [/stock is set by/, "остатки агент не меняет"],
  [/write to a marketplace/, "запись на маркетплейс не откатить"],
  [/no rollback path/, "у этого изменения нет пути отката"],
  [/shared by every site/, "это общее для всех сайтов группы, stage-копии у него нет"],
  [/an upload is a file/, "загрузка файла — не изменение; изменение — то, что его использует"],
  [/not on the agent's list/, "этого действия нет в списке агента"],
  [/fields not open to the agent here: (.+)$/, (m) => `эти поля агенту здесь не открыты: ${m[1]}`],
  [/a \/tenants\/\* path/, "изменение идёт только в API магазина /tenants/*"],
];

const CODE_RU: Record<string, string> = {
  invalid_ops: "в изменении нет операций или их больше 50",
  op_forbidden: "вашей роли это изменение не разрешено",
  wrong_status: "у этого изменения уже другой статус",
  stage_missing: "у магазина ещё нет stage-сайта",
  op_failed: "магазин не смог применить операцию",
  rollback_failed: "откат не прошёл",
  stage_site: "stage-сайт не готов",
  not_found: "такого изменения нет",
};

export function reasonRu(err: ChangesetError): string {
  for (const [re, ru] of REASON_RU) {
    const m = re.exec(err.message);
    if (m) return typeof ru === "string" ? ru : ru(m);
  }
  return CODE_RU[err.code] ?? "магазин отказал";
}

const short = (value: unknown, max = 60): string => {
  if (value === null || value === undefined || value === "") return "пусто";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const flat = text.replace(/\s+/g, " ").trim();
  return `«${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}»`;
};

function opLines(ops: OpView[] | undefined, direction: "forward" | "back" = "forward"): string[] {
  return (ops ?? []).flatMap((op) => {
    const what = KIND_RU[op.kind] ?? op.kind;
    if (!op.changes.length) return [`${what}: без изменений`];
    return op.changes.map((c) =>
      direction === "forward"
        ? `${what}, ${FIELD_RU[c.field] ?? c.field}: ${short(c.before)} → ${short(c.after)}`
        : `${what}, ${FIELD_RU[c.field] ?? c.field}: ${short(c.after)} → снова ${short(c.before)}`,
    );
  });
}

/** Where a changeset is seen: the stage copy until published, the live site after. */
function previewLink(cs: Changeset, sites: Partial<Sites>, stageOrigin: string): Card["link"] {
  const path = cs.ops?.find((op) => op.preview_path)?.preview_path ?? "/";
  if (cs.status === "published" && sites.main_url) return { label: "Открыть на сайте", href: `${sites.main_url}${path}` };
  return { label: "Посмотреть на stage", href: `${sites.stage_url ?? stageOrigin}${path}` };
}

export interface ChangeOutcome extends ToolOutcome {
  changeset?: { id: string; status: ChangesetStatus };
}

export class ChangeFlow {
  readonly #client: ChangesetClient;
  readonly #stageOrigin: string;
  /** The latest sites the backend named, for a card built from an action that returns none. */
  #sites: Partial<Sites> = {};

  constructor(client: ChangesetClient, stageHost: string) {
    this.#client = client;
    this.#stageOrigin = `https://${stageHost}`;
  }

  #denied(err: unknown, title: string): ChangeOutcome {
    if (!(err instanceof ChangesetError)) throw err;
    const why = reasonRu(err);
    return {
      text: `${title}: ${why}. Ничего не изменено.`,
      card: { kind: "denied", title, rows: [`Причина: ${why}.`, `Ответ магазина: ${err.message}`, "Ничего не изменено."] },
    };
  }

  /** The owner confirmed a proposal: draft its op, put it on stage, show where. */
  async stage(proposal: Proposal): Promise<ChangeOutcome> {
    if (!proposal.op) return { text: "У этого предложения нет операции для изменения." };
    let created: Changeset;
    try {
      const out = await this.#client.create([proposal.op], proposal.label);
      created = out.agent_changeset;
      this.#sites = out.sites;
    } catch (err) {
      return this.#denied(err, `Отказ: ${proposal.label}`);
    }
    let status: ChangesetStatus = created.status;
    try {
      status = (await this.#client.stage(created.id)).agent_changeset.status;
    } catch (err) {
      const out = this.#denied(err, `Черновик не попал на stage: ${proposal.label}`);
      return { ...out, changeset: { id: created.id, status } };
    }
    const cs = { ...created, status };
    return {
      text: `Готово на stage: ${proposal.label}. Посмотрите ссылку; скажите «публикуй», чтобы перенести на сайт, или «откати».`,
      card: {
        kind: "changeset",
        title: `Изменение на stage: ${proposal.label}`,
        rows: [...opLines(cs.ops), `Статус: ${STATUS_RU[status]}.`, "На сайте пока ничего не изменилось."],
        link: previewLink(cs, this.#sites, this.#stageOrigin),
        changeset: { id: cs.id, status },
        actions: [{ label: "Опубликовать…", action: "prepare-publish", id: cs.id }],
      },
      changeset: { id: cs.id, status },
    };
  }

  async #pick(action: "publish" | "rollback", id?: string): Promise<Changeset | null> {
    try {
      if (id) {
        const out = await this.#client.show(id);
        this.#sites = out.sites;
        return out.agent_changeset;
      }
      if (action === "rollback") {
        const out = await this.#client.show("latest");
        this.#sites = out.sites;
        return out.agent_changeset.status === "published" ? out.agent_changeset : null;
      }
      const list = await this.#client.list({ status: "staged", limit: 1 });
      this.#sites = list.sites;
      const first = list.agent_changesets[0];
      return first ? (await this.#client.show(first.id)).agent_changeset : null;
    } catch (err) {
      if (err instanceof ChangesetError && err.status === 404) return null;
      throw err;
    }
  }

  /** «публикуй» / «откати»: first the card the owner confirms, nothing sent yet. */
  async prepare(action: "publish" | "rollback", id?: string): Promise<ChangeOutcome> {
    let cs: Changeset | null;
    try {
      cs = await this.#pick(action, id);
    } catch (err) {
      return this.#denied(err, action === "publish" ? "Публикация" : "Откат");
    }
    if (!cs) {
      return action === "publish"
        ? { text: "На stage нет изменений, которые ждут публикации." }
        : { text: "Откатывать нечего: опубликованных изменений нет." };
    }
    const label = cs.summary ?? cs.op_kinds.map((k) => KIND_RU[k] ?? k).join(", ");
    if (action === "publish") {
      if (cs.status !== "staged") return { text: `«${label}» сейчас ${STATUS_RU[cs.status]}, публиковать нечего.` };
      return {
        text: `Опубликовать «${label}» на сайт? Подтвердите кнопкой.`,
        card: {
          kind: "confirm",
          title: `Опубликовать на сайт: ${label}`,
          rows: ["На сайте изменится:", ...opLines(cs.ops), `Изменение ${cs.id}, статус: ${STATUS_RU[cs.status]}.`],
          link: previewLink(cs, this.#sites, this.#stageOrigin),
          changeset: { id: cs.id, status: cs.status },
          actions: [{ label: "Опубликовать", action: "publish", id: cs.id }],
        },
      };
    }
    if (cs.status !== "published") return { text: `«${label}» сейчас ${STATUS_RU[cs.status]}, откатывать нечего.` };
    return {
      text: `Откатить «${label}» на сайте? Подтвердите кнопкой.`,
      card: {
        kind: "confirm",
        title: `Откатить на сайте: ${label}`,
        rows: ["На сайте вернётся как было:", ...opLines(cs.ops, "back"), `Изменение ${cs.id}, опубликовано ${day(cs.published_at)}.`],
        link: previewLink(cs, this.#sites, this.#stageOrigin),
        changeset: { id: cs.id, status: cs.status },
        actions: [{ label: "Откатить", action: "rollback", id: cs.id }],
      },
    };
  }

  /** The owner pressed the button on a confirm card. */
  async run(action: "publish" | "rollback" | "discard", id: string): Promise<ChangeOutcome> {
    let shown: Changeset;
    try {
      const out = await this.#client.show(id);
      shown = out.agent_changeset;
      this.#sites = out.sites;
    } catch (err) {
      return this.#denied(err, "Изменение");
    }
    const label = shown.summary ?? id;
    try {
      const done = (await this.#client[action](id)).agent_changeset;
      const cs = { ...shown, ...done, ops: shown.ops ?? [] };
      const said = action === "publish" ? "Опубликовано на сайте" : action === "rollback" ? "Откачено, на сайте снова как было" : "Черновик отменён";
      return {
        text: `${said}: ${label}.`,
        card: {
          kind: "changeset",
          title: `${said}: ${label}`,
          rows: [...opLines(cs.ops, action === "rollback" ? "back" : "forward"), `Статус: ${STATUS_RU[cs.status]}.`],
          link: previewLink(cs, this.#sites, this.#stageOrigin),
          changeset: { id: cs.id, status: cs.status },
          ...(cs.status === "published" ? { actions: [{ label: "Откатить…", action: "prepare-rollback", id: cs.id }] } : {}),
        },
        changeset: { id: cs.id, status: cs.status },
      };
    } catch (err) {
      if (err instanceof ChangesetError && err.code === "drift") {
        const diff = err.drift.flatMap((row) => {
          const fields = [...new Set([...Object.keys(objectOf(row.before)), ...Object.keys(objectOf(row.now))])];
          return fields.map((field) => ({ field: FIELD_RU[field] ?? field, before: short(objectOf(row.before)[field]), after: short(objectOf(row.now)[field]) }));
        });
        return {
          text: `Не откатил «${label}»: сайт изменили после публикации. Ничего не тронуто, разница на экране.`,
          card: {
            kind: "drift",
            title: `Откат не сделан: ${label}`,
            rows: ["Сайт изменили после публикации, поэтому откат ничего не тронул.", `Ответ магазина: ${err.message}`],
            diff,
            changeset: { id, status: shown.status },
          },
          changeset: { id, status: shown.status },
        };
      }
      return this.#denied(err, action === "publish" ? `Публикация: ${label}` : `Откат: ${label}`);
    }
  }

  /** «что изменено»: the last few changesets, newest first. */
  async list(limit = 5): Promise<ChangeOutcome> {
    let out: Awaited<ReturnType<ChangesetClient["list"]>>;
    try {
      out = await this.#client.list({ limit });
    } catch (err) {
      return this.#denied(err, "Последние изменения");
    }
    this.#sites = out.sites;
    if (!out.agent_changesets.length) return { text: "Изменений через чат ещё не было." };
    const rows = out.agent_changesets.map(
      (cs) => `${day(cs.created_at)} — ${cs.summary ?? cs.op_kinds.join(", ")} — ${STATUS_RU[cs.status]}`,
    );
    return { text: `Последние изменения:\n${rows.join("\n")}`, card: { kind: "result", title: "Последние изменения", rows } };
  }
}

const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const day = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })
    : "—";

const CHANGES_OFF: ToolOutcome = {
  text: "Изменения через stage на этом стенде выключены: подтверждение только показывает запрос.",
  card: { kind: "notice", title: "Изменения выключены", rows: ["Включаются флагом CHANGESETS=1 на стенде, который не читает живой магазин."] },
};

const changeId = (input: Record<string, unknown>) => (typeof input.id === "string" && input.id.trim() ? input.id.trim() : undefined);

/** «что изменено», «публикуй», «откати» for the model; the last two only prepare a card, the owner's button acts. */
export const CHANGE_TOOLS: Tool[] = [
  {
    name: "list_changesets",
    ports: [],
    description: "Последние изменения сайта, сделанные через чат: что, когда и где сейчас (stage, на сайте, откачено).",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Сколько показать, по умолчанию 5" } } },
    run: (input, ctx) => (ctx.changes ? ctx.changes.list(Math.min(Math.max(Number(input.limit) || 5, 1), 20)) : Promise.resolve(CHANGES_OFF)),
  },
  {
    name: "prepare_publish",
    ports: [],
    description: "Владелец сказал «публикуй»: показать карточку подтверждения — какое изменение со stage уйдёт на сайт и что там изменится. Само не публикует.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "id изменения; по умолчанию последнее на stage" } } },
    run: (input, ctx) => (ctx.changes ? ctx.changes.prepare("publish", changeId(input)) : Promise.resolve(CHANGES_OFF)),
  },
  {
    name: "prepare_rollback",
    ports: [],
    description: "Владелец сказал «откати»: показать карточку подтверждения — какое опубликованное изменение откатится и что вернётся на сайте. Само не откатывает.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "id изменения; по умолчанию последнее опубликованное" } } },
    run: (input, ctx) => (ctx.changes ? ctx.changes.prepare("rollback", changeId(input)) : Promise.resolve(CHANGES_OFF)),
  },
];
