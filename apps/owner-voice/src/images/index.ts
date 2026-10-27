/**
 * Images for the shop (t-2026-10-27-05): a prompt in, a picture out, a preview
 * card, and «поставить на товар / на баннер» as a changeset op.
 *
 * The provider sits behind one interface. This stage ships the stub only; the
 * server-side fal driver of architecture §6 is one more file next to it. Every
 * picture is counted on the server against two daily caps ($3 and 30 by
 * default); past either the chat says so and draws nothing. In RU the whole
 * service is off by flag until Ivan decides on sending RU data abroad.
 *
 * Previews live `FILES_TTL_HOURS` (24 by default, §7) and are then deleted.
 * A picture put on a product or a banner is kept: the site links to it. Its
 * address is the stand's own (`PUBLIC_URL`) until line A opens an upload path
 * for the agent; the allow-list refuses uploads today.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Cap, DailyBudget } from "../budget.ts";

export interface Picture {
  data: Uint8Array;
  contentType: string;
  /** What this one picture cost, for the daily count. */
  costUsd: number;
}

export interface ImageProvider {
  readonly name: string;
  /** What the next picture will cost, checked against the cap before drawing. */
  estimateUsd(): number;
  generate(prompt: string): Promise<Picture>;
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A picture with no network and no key: a gradient from the prompt's hash, with the prompt written on it. */
export class StubImageProvider implements ImageProvider {
  readonly name = "stub";
  readonly #usd: number;

  constructor(usd = 0.04) {
    this.#usd = usd;
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
    return { data: new TextEncoder().encode(svg), contentType: "image/svg+xml", costUsd: this.#usd };
  }
}

export class ImageCapError extends Error {}

export interface StoredImage {
  id: string;
  prompt: string;
  contentType: string;
  createdAt: string;
  /** Put on a product or a banner: kept past the preview's TTL. */
  placed: boolean;
}

const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export interface ImageServiceOptions {
  dataDir: string;
  publicUrl: string;
  cap: Cap;
  ttlHours: number;
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

  async generate(prompt: string): Promise<StoredImage & { url: string }> {
    if (this.#budget.over("images", this.#opts.cap, this.#provider.estimateUsd())) {
      const { usd, count } = this.#budget.spent("images");
      throw new ImageCapError(
        `Лимит картинок на сегодня исчерпан: ${count} из ${this.#opts.cap.count ?? "∞"}, $${usd.toFixed(2)} из $${this.#opts.cap.usd.toFixed(2)}. Новые — завтра.`,
      );
    }
    const picture = await this.#provider.generate(prompt);
    this.#budget.add("images", picture.costUsd);
    const meta: StoredImage = { id: `img_${randomUUID().replace(/-/g, "").slice(0, 16)}`, prompt, contentType: picture.contentType, createdAt: new Date().toISOString(), placed: false };
    mkdirSync(this.#dir, { recursive: true });
    writeFileSync(join(this.#dir, `${meta.id}.${EXT[meta.contentType] ?? "bin"}`), picture.data);
    writeFileSync(join(this.#dir, `${meta.id}.json`), JSON.stringify(meta));
    this.latest = meta.id;
    return { ...meta, url: this.url(meta) };
  }

  /** The address an op carries and the card shows. */
  url(meta: StoredImage): string {
    return `${this.#opts.publicUrl}/api/images/${meta.id}.${EXT[meta.contentType] ?? "bin"}`;
  }

  meta(id: string): StoredImage | null {
    if (!/^img_[a-f0-9]{16}$/.test(id)) return null;
    const file = join(this.#dir, `${id}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoredImage) : null;
  }

  read(id: string): { data: Uint8Array; contentType: string } | null {
    const meta = this.meta(id);
    if (!meta) return null;
    const file = join(this.#dir, `${id}.${EXT[meta.contentType] ?? "bin"}`);
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

  /** Delete previews older than the TTL; placed pictures stay. */
  sweep(now = Date.now()): number {
    if (!existsSync(this.#dir)) return 0;
    let removed = 0;
    for (const name of readdirSync(this.#dir).filter((n) => n.endsWith(".json"))) {
      const id = name.slice(0, -5);
      const meta = this.meta(id);
      if (!meta || meta.placed) continue;
      if (now - Date.parse(meta.createdAt) < this.#opts.ttlHours * 3_600_000) continue;
      for (const file of readdirSync(this.#dir).filter((n) => n.startsWith(`${id}.`))) {
        unlinkSync(join(this.#dir, file));
      }
      removed += 1;
    }
    return removed;
  }
}
