/**
 * The image providers: a stub that needs nothing, and the fal.ai and
 * replicate drivers (HTTP, no SDK). The key is read from the server
 * environment by `config.ts` and handed to the constructor; it goes into one
 * request header and nowhere else: not a log line, an error, a card or the
 * journal (`scrub` cuts it out of any message before it leaves this file).
 *
 * One model per operation per provider. Every call has a timeout and a size
 * cap; the result is downloaded into bytes at once, and the provider's own URL
 * is dropped. `costUsd` is the provider's reported cost when the answer has
 * one, else the dated price table below.
 */
import { createHash } from "node:crypto";

import type { FetchFn } from "../shop/api.ts";
import { guardedGet, type Lookup, NetError, readCapped, timed } from "./net.ts";

export type EditOp = "remove-bg" | "even-light";
export type Operation = "generate" | EditOp;

export const OPERATION_RU: Record<Operation, string> = {
  generate: "картинка по описанию",
  "remove-bg": "убрать фон",
  "even-light": "выровнять свет",
};

export interface Picture {
  data: Uint8Array;
  contentType: string;
  /** What this one picture cost, for the daily count. */
  costUsd: number;
  provider: string;
  model: string;
}

export interface Source {
  data: Uint8Array;
  contentType: string;
}

export interface ImageProvider {
  readonly name: string;
  modelFor(op: Operation): string;
  /** What the next call will cost, checked against the cap before it is made. */
  estimateUsd(op: Operation): number;
  generate(prompt: string): Promise<Picture>;
  edit(image: Source, op: EditOp): Promise<Picture>;
}

/** A call that failed: the message is safe to show, it holds no key and no provider address. */
export class ProviderError extends Error {
  readonly kind: "failed" | "timeout" | "too_big";
  constructor(kind: ProviderError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

export const MAX_RESULT_BYTES = 15 * 1024 * 1024;
export const CALL_TIMEOUT_MS = 90_000;

/**
 * Prices in USD per call for a picture of about one megapixel, as the public
 * model pages showed them on PRICES_AS_OF. «page» = read off the model's page;
 * «estimate» = the page gave no price, the figure is a placeholder the live run
 * must confirm in the provider's dashboard.
 */
export const PRICES_AS_OF = "2026-10-28";
export const PRICE_TABLE: Record<"fal" | "replicate", Record<Operation, { model: string; usd: number; basis: "page" | "estimate"; docs: string }>> = {
  fal: {
    generate: { model: "fal-ai/flux/schnell", usd: 0.003, basis: "page", docs: "https://fal.ai/models/fal-ai/flux/schnell" },
    "remove-bg": { model: "fal-ai/birefnet/v2", usd: 0.01, basis: "estimate", docs: "https://fal.ai/models/fal-ai/birefnet/v2" },
    "even-light": { model: "fal-ai/iclight-v2", usd: 0.1, basis: "page", docs: "https://fal.ai/models/fal-ai/iclight-v2" },
  },
  replicate: {
    generate: { model: "black-forest-labs/flux-schnell", usd: 0.003, basis: "page", docs: "https://replicate.com/black-forest-labs/flux-schnell" },
    "remove-bg": { model: "851-labs/background-remover", usd: 0.00055, basis: "page", docs: "https://replicate.com/851-labs/background-remover" },
    "even-light": { model: "zsxkib/ic-light", usd: 0.065, basis: "page", docs: "https://replicate.com/zsxkib/ic-light" },
  },
};

const LIGHT_PROMPT = "even soft studio lighting, neutral white background light, product photo, no harsh shadows";

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

const toDataUri = (src: Source) => `data:${src.contentType};base64,${Buffer.from(src.data).toString("base64")}`;

/** A picture with no network and no key: a gradient from the prompt's hash, or the owner's photo with a mark on it. */
export class StubImageProvider implements ImageProvider {
  readonly name = "stub";
  readonly #usd: number;

  constructor(usd = 0.04) {
    this.#usd = usd;
  }

  modelFor(op: Operation): string {
    return `stub-${op}`;
  }

  estimateUsd(): number {
    return this.#usd;
  }

  async generate(prompt: string): Promise<Picture> {
    const h = createHash("sha256").update(prompt).digest();
    const hue = (h[0]! * 360) / 256;
    const words = prompt.slice(0, 90).split(/\s+/);
    const lines: string[] = [];
    for (const word of words) {
      const last = lines.at(-1);
      if (last !== undefined && (last + " " + word).length <= 28) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    const text = lines
      .slice(0, 3)
      .map((l, i) => `<text x="400" y="${270 + i * 46}" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#fff">${escapeXml(l)}</text>`)
      .join("");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue.toFixed(0)},55%,45%)"/>` +
      `<stop offset="1" stop-color="hsl(${((hue + 60) % 360).toFixed(0)},60%,30%)"/></linearGradient></defs>` +
      `<rect width="800" height="600" fill="url(#g)"/><circle cx="640" cy="140" r="70" fill="rgba(255,255,255,.18)"/>` +
      `${text}<text x="400" y="560" text-anchor="middle" font-family="sans-serif" font-size="18" fill="rgba(255,255,255,.7)">заглушка, не настоящая картинка</text></svg>`;
    return { data: new TextEncoder().encode(svg), contentType: "image/svg+xml", costUsd: this.#usd, provider: this.name, model: this.modelFor("generate") };
  }

  /** The owner's photo as it was, with a checker behind it (background) or a lifted brightness (light), and the word «заглушка». */
  async edit(image: Source, op: EditOp): Promise<Picture> {
    const href = toDataUri(image);
    const back =
      op === "remove-bg"
        ? `<defs><pattern id="c" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#e5e7eb"/><rect width="20" height="20" fill="#f9fafb"/><rect x="20" y="20" width="20" height="20" fill="#f9fafb"/></pattern></defs><rect width="800" height="600" fill="url(#c)"/>`
        : `<rect width="800" height="600" fill="#fff"/>`;
    const filter = op === "even-light" ? ` style="filter:brightness(1.12) contrast(0.92)"` : "";
    const clip = op === "remove-bg" ? ` clip-path="ellipse(34% 42% at 50% 52%)"` : "";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="600" viewBox="0 0 800 600">${back}` +
      `<image href="${href}" xlink:href="${href}" x="0" y="0" width="800" height="600" preserveAspectRatio="xMidYMid meet"${filter}${clip}/>` +
      `<text x="400" y="584" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#6b7280">заглушка: ${escapeXml(OPERATION_RU[op])}, не настоящая обработка</text></svg>`;
    return { data: new TextEncoder().encode(svg), contentType: "image/svg+xml", costUsd: this.#usd, provider: this.name, model: this.modelFor(op) };
  }
}

interface DriverOptions {
  key: string;
  fetch?: FetchFn;
  lookup?: Lookup;
  timeoutMs?: number;
  maxResultBytes?: number;
  /** Replicate polls until this; fal is one request. */
  pollMs?: number;
}

abstract class HttpDriver implements ImageProvider {
  abstract readonly name: "fal" | "replicate";
  protected readonly key: string;
  protected readonly fetchFn: FetchFn;
  protected readonly lookup: Lookup | undefined;
  protected readonly timeoutMs: number;
  protected readonly maxBytes: number;

  constructor(opts: DriverOptions) {
    this.key = opts.key;
    this.fetchFn = opts.fetch ?? fetch;
    this.lookup = opts.lookup;
    this.timeoutMs = opts.timeoutMs ?? CALL_TIMEOUT_MS;
    this.maxBytes = opts.maxResultBytes ?? MAX_RESULT_BYTES;
  }

  modelFor(op: Operation): string {
    return PRICE_TABLE[this.name][op].model;
  }

  estimateUsd(op: Operation): number {
    return PRICE_TABLE[this.name][op].usd;
  }

  /** Any message with the key cut out: an upstream error can echo a header. */
  protected scrub(message: string): string {
    return this.key ? message.split(this.key).join("[ключ скрыт]") : message;
  }

  protected fail(status: number, body: string): ProviderError {
    const detail = this.scrub(body).replace(/https?:\/\/\S+/g, "[адрес скрыт]").replace(/\s+/g, " ").slice(0, 160);
    return new ProviderError("failed", `Провайдер ${this.name} ответил ${status}${detail ? `: ${detail}` : ""}.`);
  }

  /** The result downloaded into bytes; the address is used once and not kept. */
  protected async download(url: string): Promise<{ data: Uint8Array; contentType: string }> {
    try {
      const got = await guardedGet(url, { ...(this.lookup ? { lookup: this.lookup } : {}), fetch: this.fetchFn, timeoutMs: this.timeoutMs, maxBytes: this.maxBytes, type: /^image\// });
      return { data: got.data, contentType: got.contentType };
    } catch (err) {
      if (err instanceof NetError) throw new ProviderError(err.code === "timeout" ? "timeout" : err.code === "too_big" ? "too_big" : "failed", `Результат не скачался: ${err.message}`);
      throw err;
    }
  }

  protected async post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
    try {
      return await timed(this.fetchFn, url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...headers }, body: JSON.stringify(body) }, this.timeoutMs);
    } catch (err) {
      if (err instanceof NetError) throw new ProviderError("timeout", `Провайдер ${this.name} не ответил вовремя.`);
      throw new ProviderError("failed", this.scrub(`Провайдер ${this.name} недоступен.`));
    }
  }

  protected async json(res: Response): Promise<Record<string, unknown>> {
    const raw = new TextDecoder().decode(await readCapped(res, 1024 * 1024).catch(() => new Uint8Array()));
    if (!res.ok) throw this.fail(res.status, raw);
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw this.fail(res.status, "ответ не JSON");
    }
  }

  protected finish(op: Operation, got: { data: Uint8Array; contentType: string }, reported?: number): Picture {
    return { ...got, costUsd: reported ?? this.estimateUsd(op), provider: this.name, model: this.modelFor(op) };
  }

  abstract generate(prompt: string): Promise<Picture>;
  abstract edit(image: Source, op: EditOp): Promise<Picture>;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** fal.ai: `POST https://fal.run/<model>` with `Authorization: Key …`; the answer lists `images[].url` (or one `image.url`). */
export class FalProvider extends HttpDriver {
  readonly name = "fal" as const;

  async #run(op: Operation, input: Record<string, unknown>): Promise<Picture> {
    const res = await this.post(`https://fal.run/${this.modelFor(op)}`, { authorization: `Key ${this.key}` }, input);
    const body = await this.json(res);
    const first = Array.isArray(body.images) ? (body.images[0] as Record<string, unknown> | undefined) : (body.image as Record<string, unknown> | undefined);
    const url = first && typeof first.url === "string" ? first.url : null;
    if (!url) throw new ProviderError("failed", "Провайдер fal не вернул картинку.");
    return this.finish(op, await this.download(url), num(body.cost_usd));
  }

  generate(prompt: string): Promise<Picture> {
    return this.#run("generate", { prompt, image_size: "landscape_4_3", num_images: 1, enable_safety_checker: true });
  }

  edit(image: Source, op: EditOp): Promise<Picture> {
    const image_url = toDataUri(image);
    return this.#run(op, op === "remove-bg" ? { image_url } : { image_url, prompt: LIGHT_PROMPT, num_images: 1 });
  }
}

/** replicate: `POST /v1/models/<owner>/<name>/predictions` with `Prefer: wait`, then a poll of `urls.get` while it runs. */
export class ReplicateProvider extends HttpDriver {
  readonly name = "replicate" as const;
  readonly #pollMs: number;

  constructor(opts: DriverOptions) {
    super(opts);
    this.#pollMs = opts.pollMs ?? 1500;
  }

  async #run(op: Operation, input: Record<string, unknown>): Promise<Picture> {
    const auth = { authorization: `Bearer ${this.key}` };
    const res = await this.post(`https://api.replicate.com/v1/models/${this.modelFor(op)}/predictions`, { ...auth, prefer: "wait=30" }, { input });
    let body = await this.json(res);
    const deadline = Date.now() + this.timeoutMs;
    while (body.status === "starting" || body.status === "processing") {
      const poll = (body.urls as Record<string, unknown> | undefined)?.get;
      if (typeof poll !== "string" || !poll.startsWith("https://api.replicate.com/")) throw new ProviderError("failed", "Провайдер replicate не дал, где забрать результат.");
      if (Date.now() >= deadline) throw new ProviderError("timeout", "Провайдер replicate не успел вовремя.");
      await new Promise((r) => setTimeout(r, this.#pollMs));
      const next = await timed(this.fetchFn, poll, { method: "GET", headers: { ...auth, accept: "application/json" } }, this.timeoutMs).catch(() => {
        throw new ProviderError("timeout", "Провайдер replicate не ответил вовремя.");
      });
      body = await this.json(next);
    }
    if (body.status !== "succeeded") throw new ProviderError("failed", `Провайдер replicate: ${this.scrub(String(body.error ?? body.status ?? "сбой")).slice(0, 160)}.`);
    const out = Array.isArray(body.output) ? body.output[0] : body.output;
    if (typeof out !== "string") throw new ProviderError("failed", "Провайдер replicate не вернул картинку.");
    return this.finish(op, await this.download(out), num((body.metrics as Record<string, unknown> | undefined)?.cost_usd));
  }

  generate(prompt: string): Promise<Picture> {
    return this.#run("generate", { prompt, aspect_ratio: "4:3", num_outputs: 1, output_format: "jpg" });
  }

  edit(image: Source, op: EditOp): Promise<Picture> {
    const uri = toDataUri(image);
    return this.#run(op, op === "remove-bg" ? { image: uri } : { subject_image: uri, prompt: LIGHT_PROMPT });
  }
}
