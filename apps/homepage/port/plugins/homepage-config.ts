/**
 * homepage-config.ts — dev-плагин, через который режим редактирования
 * пишет раскладку главной страницы обратно в файл.
 *
 * Читает страница сам, статикой: `/homepage.cfg.json` из public/ — так
 * работает и dev-сервер, и собранный билд. Плагин добавляет ровно одну
 * вещь, которой у статики нет: запись.
 *
 *   GET  /__editor/config  → текущий файл (диагностика)
 *   PUT  /__editor/config  → перезаписать файл телом запроса
 *
 * `apply: "serve"` — в сборку плагин не попадает, и в проде эндпоинта
 * записи не существует физически.
 */

import { constants } from "node:fs";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Plugin } from "vite";

const API_PATH = "/__editor/config";
const CONFIG_FILE = "public/homepage.cfg.json";
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_BODY_BYTES = 64 * 1024;

interface BlockConfig {
  slug: string;
  visible: boolean;
}

/** Проверка формы тела. Возвращает ошибку строкой либо null. */
function validate(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return "тело запроса не объект";
  const blocks = (payload as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return "blocks должен быть непустым массивом";
  const seen = new Set<string>();
  for (const block of blocks) {
    if (!block || typeof block !== "object") return "элемент blocks не объект";
    const { slug, visible } = block as Partial<BlockConfig>;
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) return `недопустимый slug: ${String(slug)}`;
    if (typeof visible !== "boolean") return `visible у «${slug}» должен быть boolean`;
    if (seen.has(slug)) return `slug «${slug}» встречается дважды`;
    seen.add(slug);
  }
  return null;
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`тело больше ${MAX_BODY_BYTES} байт`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function homepageConfigPlugin(file = CONFIG_FILE): Plugin {
  let absolute = "";

  return {
    name: "upready:homepage-config",
    apply: "serve",

    /*
     * Файл лежит в public/, а Vite перезагружает страницу на любое изменение
     * внутри publicDir. Без этого игнора каждое сохранение из редактора
     * роняло бы страницу в full reload — вместе с открытой панелью и
     * позицией скролла.
     */
    config() {
      return { server: { watch: { ignored: [`**/${path.basename(file)}`] } } };
    },

    configResolved(resolved) {
      absolute = path.resolve(resolved.root, file);
    },

    configureServer(server) {
      server.middlewares.use(API_PATH, (req, res) => {
        void (async () => {
          res.setHeader("Cache-Control", "no-store");

          if (req.method === "GET") {
            try {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(await readFile(absolute, "utf8"));
            } catch (error) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: String(error), file: absolute }));
            }
            return;
          }

          if (req.method !== "PUT") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET, PUT");
            res.end(JSON.stringify({ ok: false, error: `метод ${req.method} не поддержан` }));
            return;
          }

          let payload: unknown;
          try {
            payload = JSON.parse(await readBody(req));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: `тело не разобрано: ${String(error)}` }));
            return;
          }

          const problem = validate(payload);
          if (problem) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: problem }));
            return;
          }

          /* Перезаписываем только существующий файл: промах по пути (не тот
           * root, не тот worktree) должен быть слышен, а не создавать вторую
           * копию конфига там, где её никто не читает. */
          try {
            await access(absolute, constants.F_OK);
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: `нет файла ${absolute}` }));
            return;
          }

          const updatedAt = new Date().toISOString();
          const body = { version: 1, updatedAt, blocks: (payload as { blocks: BlockConfig[] }).blocks };
          const text = `${JSON.stringify(body, null, 2)}\n`;
          const tmp = `${absolute}.tmp`;

          try {
            await writeFile(tmp, text, "utf8");
            await rename(tmp, absolute); // атомарная подмена: читатель не увидит полуфайл
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(error) }));
            return;
          }

          server.config.logger.info(
            `[homepage-config] раскладка сохранена: ${body.blocks.filter((b) => b.visible).length} из ${body.blocks.length} блоков включено`,
          );
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: true, updatedAt, file: absolute }));
        })();
      });
    },
  };
}
