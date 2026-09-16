import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES } from "../registry";

/**
 * THE READ-ONLY PROOF OF THE PRICE AND STOCK TABLE (w17-mp-price-stock-table).
 *
 * Ivan's standing invariant of 2026-09-16 02:46 WITA: «There is no editing of
 * marketplace prices or stocks on this screen in any form — no inline edit, no
 * bulk action, no push to marketplace. Prove it with a test that no handler
 * reaches a mutating endpoint id.»
 *
 * The belts are the ones `order-feed-read-only.unit.spec.ts` set for the order
 * desk, over the files THIS screen consists of:
 *
 *   1. the handlers export GET and nothing else — a `POST` in that directory
 *      is a route Medusa registers, whatever the body of it does;
 *   2. no handler can reach a marketplace: no `adapter.read(`, no `runSync`,
 *      no `fetch`, no registered endpoint id, and none of the paths the
 *      adapters themselves list as mutations;
 *   3. the panel sends no mutation and carries no control that edits a
 *      marketplace number — and the TABLE carries no input at all.
 *
 * The endpoint ids and the mutation paths come from `MARKETPLACES`, so a third
 * adapter is covered by being registered rather than by this file being edited
 * (rule 20).
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const HANDLER_DIR = path.join(
  REPO_ROOT,
  "apps",
  "backend",
  "src",
  "api",
  "tenants",
  "marketplaces",
  "price-stock",
);

const DECISION_MODULE = path.join(
  REPO_ROOT,
  "apps",
  "backend",
  "src",
  "modules",
  "marketplace",
  "price-stock.ts",
);

const PANEL_DIR = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "routes",
  "marketplaces",
  "price-stock",
);

const PANEL_HOOK = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "hooks",
  "api",
  "marketplace-price-stock.tsx",
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
 * construct, and so do the explanations in the handlers and on the screen. A
 * regex over raw source would find the prose and call it a defect (guard class
 * 8b, "comment").
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const BACKEND_FILES = [...walk(HANDLER_DIR), DECISION_MODULE];
const PANEL_FILES = [...walk(PANEL_DIR), PANEL_HOOK].filter((file) => existsSync(file));

describe("бэкенд-обработчики таблицы цен и остатков", () => {
  it("файлы на месте — иначе тест зелен ни о чём (правило 20a: ноль — не пусто)", () => {
    expect(walk(HANDLER_DIR).filter((file) => file.endsWith("route.ts"))).toHaveLength(3);
    expect(existsSync(DECISION_MODULE)).toBe(true);
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

  it.each(BACKEND_FILES)("%s не может позвать площадку", (file) => {
    const source = withoutComments(read(file));

    expect(source).not.toMatch(/\.read\s*\(/);
    expect(source).not.toMatch(/\brunSync\b/);
    expect(source).not.toMatch(/\binspectCredentials\b/);
    expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|\bgot\s*\(/);
  });

  it.each(BACKEND_FILES)("%s не называет ни одного зарегистрированного эндпоинта площадки", (file) => {
    const source = withoutComments(read(file));

    for (const adapter of MARKETPLACES) {
      for (const endpoint of adapter.endpoints) {
        expect(source).not.toContain(`"${endpoint.id}"`);
        expect(source).not.toContain(`'${endpoint.id}'`);
      }
    }
  });

  it.each(BACKEND_FILES)(
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

  it.each(BACKEND_FILES)("%s не пишет ни в одну таблицу площадки", (file) => {
    const source = withoutComments(read(file));

    /* Пишущие методы сервиса модуля по любой сущности mp_ — create, update, delete, upsert. */
    expect(source).not.toMatch(/\.(?:create|update|delete|upsert)Mp[A-Z]\w*\s*\(/);
  });

  it("списки запретов не пусты — иначе три предыдущих теста ничего не проверяют", () => {
    expect(MARKETPLACES.flatMap((adapter) => [...adapter.mutationDenyList]).length).toBeGreaterThan(0);
    expect(MARKETPLACES.flatMap((adapter) => [...adapter.endpoints]).length).toBeGreaterThan(0);
    expect(BACKEND_FILES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("экран панели", () => {
  it("экран существует", () => {
    expect(PANEL_FILES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(PANEL_FILES)("%s не отправляет ни одной мутации", (file) => {
    const source = withoutComments(read(file));

    expect(source).not.toMatch(/useMutation/);
    expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(source).not.toMatch(/sdk\.(?:admin|client)\.[\w.]*\.(?:create|update|delete)\b/);
  });

  it.each(PANEL_FILES)("%s не содержит кнопки правки числа площадки", (file) => {
    const source = withoutComments(read(file));

    /*
     * Слова, которыми называется ПРАВКА цены или остатка на площадке. Кнопка
     * «Скачать CSV» и поля порогов — действия над НАШИМ экраном, и в список не
     * входят.
     */
    for (const word of [
      "Отправить на площадку",
      "Изменить цену",
      "Обновить цену",
      "Изменить остаток",
      "Установить остаток",
      "Применить ко всем",
      "Массовое",
      "Синхронизировать остатки",
    ]) {
      expect(source).not.toContain(word);
    }
  });

  it.each(walk(path.join(PANEL_DIR, "components")))(
    "%s: в самой таблице нет ни одного поля ввода",
    (file) => {
      const source = withoutComments(read(file));

      expect(source).not.toMatch(/<Input\b|<input\b|<Textarea\b|contentEditable/);
    },
  );

  it("поля порогов живут ровно на экране, а не в таблице", () => {
    const screen = withoutComments(read(path.join(PANEL_DIR, "price-stock.tsx")));

    expect(screen).toMatch(/<Input\b/);
    expect(walk(path.join(PANEL_DIR, "components")).length).toBeGreaterThanOrEqual(3);
  });
});
