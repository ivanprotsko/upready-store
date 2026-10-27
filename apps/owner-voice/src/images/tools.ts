/**
 * The image tools the chat calls: draw a picture, and put one on a product or
 * a home banner. Putting is a write, so it becomes a proposal like any other:
 * the owner confirms it and it goes to stage as a changeset op.
 */
import { runCommand } from "../commands/run.ts";
import type { Tool, ToolContext, ToolOutcome } from "../tools.ts";
import { ImageCapError } from "./index.ts";

const str = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const off = (ctx: ToolContext): ToolOutcome => {
  const why = ctx.imagesOff ?? "картинки на этом стенде выключены";
  return { text: `Картинки сейчас не рисую: ${why}.`, card: { kind: "notice", title: "Картинки выключены", rows: [`Причина: ${why}.`] } };
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
      const { count, capCount, usd, capUsd } = ctx.images.usage();
      return {
        text: `Нарисовал: «${prompt.slice(0, 80)}». Скажите «поставь на товар …» или «поставь на баннер».`,
        card: {
          kind: "image",
          title: `Картинка: ${prompt.slice(0, 60)}`,
          rows: [`Сегодня: ${count} из ${capCount ?? "∞"} картинок, $${usd.toFixed(2)} из $${capUsd.toFixed(2)}.`, "Это превью: оно удалится через сутки, если не поставить его на сайт."],
          image: { src: image.url, alt: prompt.slice(0, 120) },
          actions: [
            { label: "На товар…", action: "place-product", id: image.id },
            { label: "На баннер", action: "place-banner", id: image.id },
          ],
        },
      };
    } catch (err) {
      if (!(err instanceof ImageCapError)) throw err;
      return { text: err.message, card: { kind: "notice", title: "Лимит картинок", rows: [err.message] } };
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
      if (out.proposal) ctx.images.markPlaced(meta.id);
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
    ctx.images.markPlaced(meta.id);
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

export const IMAGE_TOOLS: Tool[] = [generateImage, placeImage];
