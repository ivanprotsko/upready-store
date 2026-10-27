/**
 * The image tools the chat calls: draw a picture, edit the owner's photo (sent
 * in the chat or found on a page link), and put one on a product or a home
 * banner. Putting is a write, so it becomes a proposal like any other:
 * the owner confirms it and it goes to stage as a changeset op.
 */
import { runCommand } from "../commands/run.ts";
import type { Tool, ToolContext, ToolOutcome } from "../tools.ts";
import { guardedGet, NetError } from "./net.ts";
import { ImageCapError, type ImageService, type StoredImage } from "./index.ts";
import { MAX_PAGE_PICTURES, findPagePictures } from "./page.ts";
import { type EditOp, OPERATION_RU, ProviderError } from "./providers.ts";

const str = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const off = (ctx: ToolContext): ToolOutcome => {
  const why = ctx.imagesOff ?? "картинки на этом стенде выключены";
  return { text: `Картинки сейчас не рисую: ${why}.`, card: { kind: "notice", title: "Картинки выключены", rows: [`Причина: ${why}.`] } };
};

const PAGE_BYTES = 5 * 1024 * 1024;
const PICTURE_BYTES = 15 * 1024 * 1024;
const NET_TIMEOUT_MS = 10_000;

const usageRow = (images: ImageService): string => {
  const { count, capCount, usd, capUsd } = images.usage();
  return `Сегодня: ${count} из ${capCount ?? "∞"} картинок, $${usd.toFixed(2)} из $${capUsd.toFixed(2)}.`;
};

const who = (images: ImageService, meta: StoredImage): string => {
  const name = images.provider === "stub" ? "заглушка (stub), не настоящая обработка" : `${meta.provider ?? images.provider}, ${meta.model ?? ""}`.trim();
  return `Кто делал: ${name}. Стоимость: $${(meta.costUsd ?? 0).toFixed(4)}.`;
};

const capNotice = (err: ImageCapError): ToolOutcome => ({ text: err.message, card: { kind: "notice", title: "Лимит картинок", rows: [err.message] } });

/** A provider failure in plain words: nothing was charged, nothing changed. */
const failed = (err: ProviderError): ToolOutcome => ({
  text: `Не получилось: ${err.message} Ничего не потрачено.`,
  card: { kind: "notice", title: "Обработка не удалась", rows: [err.message, "Деньги не списаны, на сайте ничего не изменилось."] },
});

type Done = StoredImage & { url: string; beforeUrl: string };

/** Before and after on the one image card the chat already has. */
function editCard(images: ImageService, out: Done, op: EditOp): ToolOutcome {
  return {
    text: `Готово: ${OPERATION_RU[op]}. Слева было, справа стало; ${images.provider === "stub" ? "это заглушка, настоящей обработки нет. " : ""}скажите «на товар …» или нажмите кнопку.`,
    card: {
      kind: "image",
      title: `Фото: ${OPERATION_RU[op]}`,
      rows: [`Операция: ${OPERATION_RU[op]}.`, who(images, out), usageRow(images), "Это превью: на сайт оно не идёт без вашего «да» и удалится через сутки."],
      images: [
        { src: out.beforeUrl, alt: "Фото до обработки", label: "До" },
        { src: out.url, alt: "Фото после обработки", label: "После" },
      ],
      actions: [
        { label: "На товар…", action: "place-product", id: out.id },
        { label: "Сделать ещё раз", action: "redo", id: out.id },
        { label: "Отмена", action: "cancel", id: out.id },
      ],
    },
  };
}

const asOp = (value: unknown): EditOp | null => (value === "remove-bg" || value === "even-light" ? value : null);

const askWhich = (sourceId: string): ToolOutcome => ({
  text: "Что сделать с фото: убрать фон или выровнять свет?",
  card: {
    kind: "notice",
    title: "Что сделать с фото?",
    rows: ["Убрать фон или выровнять свет. Скажите словами или нажмите кнопку."],
    actions: [
      { label: "Убрать фон", action: "edit-bg", id: sourceId },
      { label: "Выровнять свет", action: "edit-light", id: sourceId },
    ],
  },
});

/** The bytes of the owner's photo: a file sent in the chat, or a picture picked from a page. */
function sourceOf(ctx: ToolContext, id: string): { data: Uint8Array; contentType: string; label: string } | null {
  if (id.startsWith("file_") && ctx.files) {
    const meta = ctx.files.get(id);
    const data = meta?.kind === "image" ? ctx.files.bytes(id) : null;
    return meta && data ? { data, contentType: meta.type.split(";")[0]!, label: meta.name } : null;
  }
  const got = id.startsWith("img_") ? ctx.images?.source(id) : null;
  return got ? { ...got, label: "фото со страницы" } : null;
}

const editPhoto: Tool = {
  name: "edit_photo",
  ports: [],
  description:
    "Обработать фото, которое владелец прислал в чат или выбрал со страницы: убрать фон (remove-bg) или выровнять свет (even-light). Показывает до и после; на сайт ставит только place_image после подтверждения. Если операция не названа, спроси, какую.",
  inputSchema: {
    type: "object",
    properties: {
      op: { type: "string", enum: ["remove-bg", "even-light"], description: "Что сделать" },
      file: { type: "string", description: "id файла или картинки; по умолчанию последнее присланное фото" },
    },
  },
  async run(input, ctx) {
    if (!ctx.images) return off(ctx);
    const id = str(input, "file") ?? ctx.photos?.lastFile ?? null;
    if (!id) return { text: "Пришлите фото или ссылку на страницу товара." };
    const source = sourceOf(ctx, id);
    if (!source) return { text: "Это фото уже удалено или не загрузилось. Пришлите его заново." };
    const op = asOp(input.op);
    if (!op) return askWhich(id);
    try {
      const out = await ctx.images.edit(source, op, source.label);
      if (ctx.photos) ctx.photos.pendingOp = null;
      return editCard(ctx.images, out, op);
    } catch (err) {
      if (err instanceof ImageCapError) return capNotice(err);
      if (err instanceof ProviderError) return failed(err);
      throw err;
    }
  },
};

const findPagePhotos: Tool = {
  name: "find_page_photos",
  ports: [],
  description:
    "По ссылке на страницу товара (магазин или поставщик) найти фото и показать до шести под номерами; владелец выбирает номер. Если он сразу сказал, что сделать, передай op.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Ссылка https на страницу товара" },
      op: { type: "string", enum: ["remove-bg", "even-light"], description: "Что сделать с выбранным фото, если сказано" },
    },
    required: ["url"],
  },
  async run(input, ctx) {
    if (!ctx.images) return off(ctx);
    const url = str(input, "url");
    if (!url) return { text: "Пришлите ссылку на страницу товара." };
    const net = { ...(ctx.net?.fetch ? { fetch: ctx.net.fetch } : {}), ...(ctx.net?.lookup ? { lookup: ctx.net.lookup } : {}) };
    let found: { page: string; srcs: string[] };
    try {
      const page = await guardedGet(url, { ...net, timeoutMs: NET_TIMEOUT_MS, maxBytes: PAGE_BYTES, type: /^(text\/html|application\/xhtml\+xml)$/ });
      found = { page: page.url, srcs: findPagePictures(new TextDecoder().decode(page.data), page.url) };
    } catch (err) {
      if (!(err instanceof NetError)) throw err;
      return { text: `Страницу не открыл: ${err.message} Пришлите само фото.`, card: { kind: "notice", title: "Страница не открылась", rows: [err.message, "Можно прислать фото в чат."] } };
    }
    // Each candidate is downloaded here (guarded, capped) so the card shows our copy and the pick needs no second trip.
    const stashed: { id: string; url: string }[] = [];
    for (const src of found.srcs) {
      try {
        const pic = await guardedGet(src, { ...net, timeoutMs: NET_TIMEOUT_MS, maxBytes: PICTURE_BYTES, type: /^image\/(png|jpeg|webp|gif)$/ });
        const meta = ctx.images.stash({ data: pic.data, contentType: pic.contentType }, "фото со страницы");
        stashed.push({ id: meta.id, url: ctx.images.url(meta) });
      } catch (err) {
        if (!(err instanceof NetError)) throw err;
      }
    }
    if (!stashed.length) {
      return { text: "На странице я фото не нашёл. Пришлите его в чат.", card: { kind: "notice", title: "Фото на странице не нашлось", rows: ["Ни в og:image, ни в разметке товара, ни в тексте страницы.", "Пришлите фото в чат."] } };
    }
    if (ctx.photos) {
      ctx.photos.candidates = stashed.map((s) => s.id);
      ctx.photos.pendingOp = asOp(input.op);
    }
    const op = asOp(input.op);
    return {
      text: `Нашёл фото: ${stashed.length}. Скажите номер${op ? ` — сделаю: ${OPERATION_RU[op]}` : ""}.`,
      card: {
        kind: "image",
        title: `Фото на странице: ${stashed.length}`,
        rows: [`Страница: ${new URL(found.page).hostname}`, `Нашёл до ${MAX_PAGE_PICTURES}; выберите номер.${op ? ` Потом: ${OPERATION_RU[op]}.` : ""}`],
        images: stashed.map((s, i) => ({ src: s.url, alt: `Фото ${i + 1} со страницы`, label: String(i + 1) })),
        actions: stashed.map((s, i) => ({ label: `Фото ${i + 1}`, action: "pick-photo", id: s.id })),
      },
    };
  },
};

const pickPhoto: Tool = {
  name: "pick_photo",
  ports: [],
  description: "Выбрать фото под номером из найденных на странице. Если операция уже названа, сразу запускает её.",
  inputSchema: {
    type: "object",
    properties: { n: { type: "number", description: "Номер с 1" }, op: { type: "string", enum: ["remove-bg", "even-light"], description: "Что сделать, если сказано" }, id: { type: "string", description: "id картинки, если выбор кнопкой" } },
  },
  async run(input, ctx) {
    if (!ctx.images || !ctx.photos) return off(ctx);
    const list = ctx.photos.candidates;
    const byId = str(input, "id");
    const id = byId && list.includes(byId) ? byId : list[Math.floor(Number(input.n)) - 1];
    if (!list.length) return { text: "Сначала пришлите ссылку на страницу товара." };
    if (!id) return { text: `Такого номера нет: назовите число от 1 до ${list.length}.` };
    ctx.photos.lastFile = id;
    const op = asOp(input.op) ?? ctx.photos.pendingOp;
    if (!op) return askWhich(id);
    return editPhoto.run({ file: id, op }, ctx);
  },
};

const generateImage: Tool = {
  name: "generate_image",
  ports: [],
  description: "Нарисовать картинку для магазина по описанию: баннер, обложку товара. Показывает превью; на сайт ставит только place_image после подтверждения.",
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string", description: "Что нарисовать, своими словами" } },
    required: ["prompt"],
  },
  async run(input, ctx) {
    if (!ctx.images) return off(ctx);
    const prompt = str(input, "prompt");
    if (!prompt) return { text: "Скажите, что нарисовать." };
    try {
      const image = await ctx.images.generate(prompt.slice(0, 500));
      return {
        text: `Нарисовал: «${prompt.slice(0, 80)}». Скажите «поставь на товар …» или «поставь на баннер».`,
        card: {
          kind: "image",
          title: `Картинка: ${prompt.slice(0, 60)}`,
          rows: [
            who(ctx.images, image),
            usageRow(ctx.images),
            "Это превью: оно удалится через сутки, если не поставить его на сайт.",
          ],
          image: { src: image.url, alt: prompt.slice(0, 120) },
          actions: [
            { label: "На товар…", action: "place-product", id: image.id },
            { label: "На баннер", action: "place-banner", id: image.id },
            { label: "Сделать ещё раз", action: "redo", id: image.id },
            { label: "Отмена", action: "cancel", id: image.id },
          ],
        },
      };
    } catch (err) {
      if (err instanceof ProviderError) return failed(err);
      if (!(err instanceof ImageCapError)) throw err;
      return capNotice(err);
    }
  },
};

type Row = Record<string, unknown>;

const placeImage: Tool = {
  name: "place_image",
  ports: [],
  description:
    "Поставить нарисованную картинку на товар (обложкой) или на баннер главной. Это изменение: оно становится предложением, владелец подтверждает, и оно уходит на stage.",
  inputSchema: {
    type: "object",
    properties: {
      target: { type: "string", enum: ["product", "banner"], description: "Куда поставить" },
      product: { type: "string", description: "Название товара, если target = product" },
      banner: { type: "number", description: "Номер баннера на главной, с 1; по умолчанию первый" },
      image: { type: "string", description: "id картинки; по умолчанию последняя нарисованная" },
    },
    required: ["target"],
  },
  async run(input, ctx) {
    if (!ctx.images) return off(ctx);
    const id = str(input, "image") ?? ctx.images.latest;
    const meta = id ? ctx.images.meta(id) : null;
    if (!meta) return { text: "Сначала нарисуйте картинку: скажите «нарисуй …»." };
    const url = ctx.images.url(meta);
    if (input.target === "product") {
      const product = str(input, "product");
      if (!product) return { text: "Назовите товар, на который поставить картинку." };
      const out = await runCommand("products.update", { product, body: { thumbnail: url, images: [{ url }] } }, ctx);
      if (out.proposal) ctx.proposals?.attach(out.proposal.id, { image: meta.id, local: url });
      return out.card ? { text: out.text, card: out.card } : { text: out.text };
    }
    if (!ctx.proposals) return { text: "Изменения на этом стенде выключены." };
    const home = ((await ctx.shop.owner("/tenants/home")) as Row).home as Row | undefined;
    const content = (home?.content ?? {}) as Row;
    const banners = Array.isArray(content.banners) ? (content.banners as Row[]) : [];
    if (!banners.length) return { text: "На главной нет баннеров, ставить некуда." };
    const n = Math.min(Math.max(Number(input.banner) || 1, 1), banners.length);
    const next = { ...content, banners: banners.map((b, i) => (i === n - 1 ? { ...b, image: url } : b)) };
    const label = `Картинка на баннер ${n} главной`;
    const request = { method: "PUT", url: `${ctx.apiUrl ?? ""}/tenants/home`, body: { content: next } };
    const proposal = ctx.proposals.add({ id: "home.banner_image", label_ru: label }, request, { method: "PUT", path: "/tenants/home", body: { content: next } });
    ctx.proposals.attach(proposal.id, { image: meta.id, local: url });
    const title = String(banners[n - 1]!.title ?? `баннер ${n}`);
    return {
      text: `Подготовил: картинка на баннер «${title}». ${ctx.changes ? "После «Подтвердить» она попадёт на stage." : "Подтверждение на этом стенде только покажет запрос."}`,
      card: {
        kind: "proposal",
        title: `Предложение: ${label}`,
        rows: [`Баннер «${title}»: картинка ${String(banners[n - 1]!.image ?? "нет")} → новая`, `PUT ${request.url}`, "Ждёт подтверждения 5 минут."],
        proposalId: proposal.id,
        request,
        image: { src: url, alt: meta.prompt.slice(0, 120) },
      },
    };
  },
};

export const IMAGE_TOOLS: Tool[] = [generateImage, editPhoto, findPagePhotos, pickPhoto, placeImage];
