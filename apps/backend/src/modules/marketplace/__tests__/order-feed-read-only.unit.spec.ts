import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES } from "../registry";

/**
 * THE READ-ONLY PROOF OF THE ORDER DESK (w15-mp-orders-desk).
 *
 * Ivan's standing invariant of 2026-09-16 02:46 WITA: the screen SHOWS
 * marketplace orders and never changes them. No «принять», no «отгрузить», no
 * «печать этикетки», no status change on the marketplace side. «Confirm that
 * with a test, not with a promise.»
 *
 * Three belts, each over the files the SCREEN actually consists of:
 *
 *   1. The handlers export GET and nothing else. A `POST` in this directory is
 *      a route Medusa would register, whatever the body of it does.
 *   2. No handler can reach a marketplace: no `adapter.read(`, no `runSync`,
 *      no registered endpoint id, and none of the paths the adapters
 *      themselves list as mutations. `readCredentials` is the one adapter
 *      member allowed, and it reads the shop's own database.
 *   3. The panel screen sends no mutation: no `useMutation`, no verb but GET
 *      through the SDK, and no button whose job is to act on an order.
 *
 * The endpoint ids and the mutation paths come from `MARKETPLACES`, so a third
 * adapter is covered by being registered rather than by this file being edited
 * (rule 20).
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

/** The backend half of the screen: three routes and what they import. */
const HANDLER_DIR = path.join(
  REPO_ROOT,
  "apps",
  "backend",
  "src",
  "api",
  "tenants",
  "marketplace-orders",
);

const FEED_MODULES = [
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "order-feed.ts"),
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "order-status.ts"),
];

/** The panel half: the screens the owner opens. */
const PANEL_DIR = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "routes",
  "marketplace-orders",
);

const PANEL_HOOK = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "hooks",
  "api",
  "marketplace-orders.tsx",
);

const walk = (dir: string, found: string[] = []): string[] => {
  if (!existsSync(dir)) {
    return found;
  }
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
};

const read = (file: string) => readFileSync(file, "utf8");

/**
 * Comments are cut before the scan: this very file names every forbidden
 * construct, and so do the explanations in the handlers. A regex over raw
 * source would find the prose and call it a defect (guard class 8b,
 * "comment").
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("бэкенд-обработчики ленты заказов", () => {
  const handlers = walk(HANDLER_DIR);

  it("сами файлы на месте — иначе тест зелен ни о чём (правило 20a: ноль — не пусто)", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(4);
    expect(handlers.filter((file) => file.endsWith("route.ts"))).toHaveLength(3);
  });

  it.each(walk(HANDLER_DIR).filter((file) => file.endsWith("route.ts")))(
    "%s экспортирует только GET",
    (file) => {
      const source = withoutComments(read(file));

      expect(source).toMatch(/export const GET\b/);
      for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(source).not.toMatch(new RegExp(`export\\s+(?:const|async function)\\s+${verb}\\b`));
      }
    },
  );

  it.each([...walk(HANDLER_DIR), ...FEED_MODULES])("%s не может позвать площадку", (file) => {
    const source = withoutComments(read(file));

    /* Никакого сетевого члена адаптера. readCredentials читает нашу же базу. */
    expect(source).not.toMatch(/\.read\s*\(/);
    expect(source).not.toMatch(/\brunSync\b/);
    expect(source).not.toMatch(/\binspectCredentials\b/);
    expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|\bgot\s*\(/);
  });

  it.each([...walk(HANDLER_DIR), ...FEED_MODULES])(
    "%s не называет ни одного зарегистрированного эндпоинта площадки",
    (file) => {
      const source = withoutComments(read(file));

      for (const adapter of MARKETPLACES) {
        for (const endpoint of adapter.endpoints) {
          expect(source).not.toContain(`"${endpoint.id}"`);
          expect(source).not.toContain(`'${endpoint.id}'`);
        }
      }
    },
  );

  it.each([...walk(HANDLER_DIR), ...FEED_MODULES])(
    "%s не называет ни одного пути, который площадка считает записью",
    (file) => {
      const source = withoutComments(read(file));

      for (const adapter of MARKETPLACES) {
        for (const mutation of adapter.mutationDenyList) {
          expect(source).not.toContain(mutation.path);
        }
      }
    },
  );

  it("список запретов не пуст — иначе предыдущий тест ничего не проверяет", () => {
    const mutations = MARKETPLACES.flatMap((adapter) => [...adapter.mutationDenyList]);
    const endpoints = MARKETPLACES.flatMap((adapter) => [...adapter.endpoints]);

    expect(mutations.length).toBeGreaterThan(0);
    expect(endpoints.length).toBeGreaterThan(0);
  });
});

describe("экран панели", () => {
  const panelFiles = [...walk(PANEL_DIR), PANEL_HOOK].filter((file) => existsSync(file));

  it("экран существует", () => {
    expect(panelFiles.length).toBeGreaterThanOrEqual(2);
  });

  it.each([...walk(PANEL_DIR), PANEL_HOOK].filter((file) => existsSync(file)))(
    "%s не отправляет ни одной мутации",
    (file) => {
      const source = withoutComments(read(file));

      expect(source).not.toMatch(/useMutation/);
      expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
      expect(source).not.toMatch(/sdk\.(?:admin|client)\.[\w.]*\.(?:create|update|delete)\b/);
    },
  );

  it.each([...walk(PANEL_DIR), PANEL_HOOK].filter((file) => existsSync(file)))(
    "%s не содержит кнопки действия над заказом площадки",
    (file) => {
      const source = withoutComments(read(file));

      /*
       * Слова, которыми называется действие над заказом НА площадке. Проверяем
       * по тексту разметки: кнопка «Скачать CSV» или «Сбросить фильтры» —
       * действие над НАШИМ экраном и в список не входит.
       */
      for (const word of [
        "Принять",
        "Отгрузить",
        "Собрать",
        "Отменить заказ",
        "Печать этикетки",
        "Этикетк",
        "Сменить статус",
        "Подтвердить заказ",
      ]) {
        expect(source).not.toContain(word);
      }
    },
  );
});
