/**
 * Images for the shop (t-2026-10-27-05): a prompt in, a picture out, a preview
 * card, and «поставить на товар / на баннер» as a changeset op.
 *
 * The provider sits behind one interface (`providers.ts`: the stub, fal and
 * replicate). Edits of the owner's own photo (remove the background, even out
 * the light) and generations share it. Every call is counted on the server
 * against two daily caps ($3 and 30 by default); past either the chat says so
 * and calls nothing. Every call, paid or refused, is one line of
 * `DATA_DIR/images/costs.jsonl`. In RU the whole service is off by flag until
 * Ivan decides on sending RU data abroad.
 *
 * Previews (the result and the owner's original) live `FILES_TTL_HOURS` (24 by
 * default, §7), or until «отмена» / «нет», and are then deleted. After the
 * owner's «да» the picture is uploaded to the shop (`POST /tenants/uploads`)
 * and the site links to the shop's copy, so the local bytes can go.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Cap, DailyBudget } from "../budget.ts";
import { type EditOp, type ImageProvider, type Operation, type Picture, ProviderError, type Source } from "./providers.ts";

export { StubImageProvider, type ImageProvider, type Picture } from "./providers.ts";

export class ImageCapError extends Error {}

export interface StoredImage {
  id: string;
  prompt: string;
  contentType: string;
  createdAt: string;
  /** Put on a product or a banner: kept past the preview's TTL. */
  placed: boolean;
  /** `generated` from a description, `edited` from the owner's photo, `original` the photo before an edit. */
  kind?: "generated" | "edited" | "original";
  op?: Operation;
  provider?: string;
  model?: string;
  costUsd?: number;
  /** For an edit: the id of the original, shown as «до». */
  before?: string;
}

export type JournalStatus = "ok" | "failed" | "refused by cap";

const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const extOf = (type: string) => EXT[type] ?? "bin";
/** The extensions `url()` can write, for the route that serves them. */
export const IMAGE_FILE = /^(img_[a-f0-9]{16})\.(svg|png|jpg|webp|gif)$/;

export interface ImageServiceOptions {
  dataDir: string;
  publicUrl: string;
  cap: Cap;
  ttlHours: number;
  /** The shop's host, for the journal line. */
  shop?: string;
  now?: () => Date;
}

export class ImageService {
  readonly #provider: ImageProvider;
  readonly #budget: DailyBudget;
  readonly #opts: ImageServiceOptions;
  readonly #dir: string;
  /** The last picture drawn, for «поставь на товар» with no id. */
  latest: string | null = null;

  constructor(provider: ImageProvider, budget: DailyBudget, opts: ImageServiceOptions) {
    this.#provider = provider;
    this.#budget = budget;
    this.#opts = opts;
    this.#dir = join(opts.dataDir, "images");
  }

  get provider(): string {
    return this.#provider.name;
  }

  /** Today's count against the caps, for the status and the page. */
  usage() {
    const spent = this.#budget.spent("images");
    return { usd: spent.usd, count: spent.count, capUsd: this.#opts.cap.usd, capCount: this.#opts.cap.count ?? null, capped: this.#budget.reached("images", this.#opts.cap) };
  }

  /** One line per call, never a key, an address or a customer's data. */
  #journal(op: Operation, status: JournalStatus, costUsd: number, picture: string | null): void {
    mkdirSync(this.#dir, { recursive: true });
    const line = {
      time: (this.#opts.now?.() ?? new Date()).toISOString(),
      shop: this.#opts.shop ?? "",
      provider: this.#provider.name,
      model: this.#provider.modelFor(op),
      operation: op,
      cost_usd: Number(costUsd.toFixed(6)),
      picture,
      status,
    };
    appendFileSync(join(this.#dir, "costs.jsonl"), `${JSON.stringify(line)}\n`);
  }

  #store(picture: Picture, meta: Omit<StoredImage, "id" | "contentType" | "createdAt" | "placed">): StoredImage {
    const full: StoredImage = { id: `img_${randomUUID().replace(/-/g, "").slice(0, 16)}`, contentType: picture.contentType, createdAt: (this.#opts.now?.() ?? new Date()).toISOString(), placed: false, ...meta };
    mkdirSync(this.#dir, { recursive: true });
    writeFileSync(join(this.#dir, `${full.id}.${extOf(full.contentType)}`), picture.data);
    writeFileSync(join(this.#dir, `${full.id}.json`), JSON.stringify(full));
    return full;
  }

  /** The cap first, the call second, the journal always. */
  async #call(op: Operation, run: () => Promise<Picture>, save: (picture: Picture) => StoredImage): Promise<StoredImage & { url: string }> {
    if (this.#budget.over("images", this.#opts.cap, this.#provider.estimateUsd(op))) {
      const { usd, count } = this.#budget.spent("images");
      this.#journal(op, "refused by cap", 0, null);
      throw new ImageCapError(
        `Лимит картинок на сегодня исчерпан: ${count} из ${this.#opts.cap.count ?? "∞"}, $${usd.toFixed(2)} из $${this.#opts.cap.usd.toFixed(2)}. Новые — завтра.`,
      );
    }
    let picture: Picture;
    try {
      picture = await run();
    } catch (err) {
      this.#journal(op, "failed", 0, null);
      throw err;
    }
    this.#budget.add("images", picture.costUsd);
    const meta = save(picture);
    this.#journal(op, "ok", picture.costUsd, meta.id);
    this.latest = meta.id;
    return { ...meta, url: this.url(meta) };
  }

  generate(prompt: string): Promise<StoredImage & { url: string }> {
    return this.#call(
      "generate",
      () => this.#provider.generate(prompt),
      (picture) => this.#store(picture, { prompt, kind: "generated", op: "generate", provider: picture.provider, model: picture.model, costUsd: picture.costUsd }),
    );
  }

  /** Edit the owner's photo. The original is kept as `before` so the card can show both. */
  async edit(source: Source, op: EditOp, label: string, redoOf?: string): Promise<StoredImage & { url: string; beforeUrl: string }> {
    // A redo reuses the original already stored; a first edit stores it once, after the cap allows the call.
    let beforeId = redoOf ?? null;
    const out = await this.#call(
      op,
      () => this.#provider.edit(source, op),
      (picture) => {
        if (!beforeId) beforeId = this.#store({ data: source.data, contentType: source.contentType, costUsd: 0, provider: "", model: "" }, { prompt: label, kind: "original" }).id;
        return this.#store(picture, { prompt: label, kind: "edited", op, provider: picture.provider, model: picture.model, costUsd: picture.costUsd, before: beforeId });
      },
    );
    return { ...out, beforeUrl: this.url(this.meta(beforeId!)!) };
  }

  /** A picture the owner supplied (found on a page): kept as an original, no provider call, no cap, no journal line. */
  stash(source: Source, label: string): StoredImage {
    return this.#store({ ...source, costUsd: 0, provider: "", model: "" }, { prompt: label, kind: "original" });
  }

  /** The original's bytes for a redo, with its type. */
  source(id: string): Source | null {
    const got = this.read(id);
    return got ? { data: got.data, contentType: got.contentType } : null;
  }

  /** The address an op carries and the card shows. */
  url(meta: StoredImage): string {
    return `${this.#opts.publicUrl}/api/images/${meta.id}.${extOf(meta.contentType)}`;
  }

  meta(id: string): StoredImage | null {
    if (!/^img_[a-f0-9]{16}$/.test(id)) return null;
    const file = join(this.#dir, `${id}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoredImage) : null;
  }

  read(id: string): { data: Uint8Array; contentType: string } | null {
    const meta = this.meta(id);
    if (!meta) return null;
    const file = join(this.#dir, `${id}.${extOf(meta.contentType)}`);
    return existsSync(file) ? { data: new Uint8Array(readFileSync(file)), contentType: meta.contentType } : null;
  }

  /** Keep a picture once the owner puts it on the site. */
  markPlaced(id: string): void {
    const meta = this.meta(id);
    if (!meta) return;
    const file = join(this.#dir, `${id}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify({ ...meta, placed: true }));
    renameSync(`${file}.tmp`, file);
  }

  #remove(id: string): void {
    for (const file of readdirSync(this.#dir).filter((n) => n.startsWith(`${id}.`))) unlinkSync(join(this.#dir, file));
  }

  /** After a successful upload the shop holds its own copy: the local bytes go. */
  retire(id: string): void {
    if (this.meta(id)) this.#remove(id);
  }

  /** «Нет», cancel: the result and its original are deleted now, nothing was sent anywhere. */
  discard(id: string): boolean {
    const meta = this.meta(id);
    if (!meta || meta.placed) return false;
    this.#remove(id);
    if (meta.before && !this.#isShared(meta.before, id)) this.#remove(meta.before);
    if (this.latest === id) this.latest = null;
    return true;
  }

  /** The original is still the «before» of another edit (a redo): keep it. */
  #isShared(beforeId: string, except: string): boolean {
    return readdirSync(this.#dir)
      .filter((n) => n.endsWith(".json") && n !== `${except}.json` && n !== "costs.jsonl")
      .some((n) => (JSON.parse(readFileSync(join(this.#dir, n), "utf8")) as StoredImage).before === beforeId);
  }

  /** Delete previews older than the TTL; placed pictures stay. */
  sweep(now = Date.now()): number {
    if (!existsSync(this.#dir)) return 0;
    let removed = 0;
    for (const name of readdirSync(this.#dir).filter((n) => /^img_[a-f0-9]{16}\.json$/.test(n))) {
      const id = name.slice(0, -5);
      const meta = this.meta(id);
      if (!meta || meta.placed) continue;
      if (now - Date.parse(meta.createdAt) < this.#opts.ttlHours * 3_600_000) continue;
      this.#remove(id);
      removed += 1;
    }
    return removed;
  }
}

export { ProviderError };
