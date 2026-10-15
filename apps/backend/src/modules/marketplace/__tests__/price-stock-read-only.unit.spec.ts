import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES } from "../registry";

/**
 * THE READ-ONLY PROOF OF THE PRICE AND STOCK TABLE (w17-mp-price-stock-table,
 * moved to «Wildberries → Цены и остатки» by mp-section-design task-03).
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
 *   3. the panel sends no mutation, carries no control that edits a
 *      marketplace number and, since the thresholds became filters, no input
 *      at all — not in the table and not on the screen.
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
  "[marketplace]",
  "price-stock",
);

const MODULE_DIR = path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace");

/**
 * The decisions: `price-stock.ts` and the files it re-exports, one per section
 * since t-2026-10-14-55. Every file of `price-stock/` must be on this list —
 * the second test below says so — or a decision moved into a new file would
 * leave the proof.
 */
const DECISION_MODULES = [
  path.join(MODULE_DIR, "price-stock.ts"),
  path.join(MODULE_DIR, "price-stock", "freshness.ts"),
  path.join(MODULE_DIR, "price-stock", "rows.ts"),
  path.join(MODULE_DIR, "price-stock", "query.ts"),
  path.join(MODULE_DIR, "price-stock", "filter-sort.ts"),
  path.join(MODULE_DIR, "price-stock", "csv.ts"),
];

const PANEL_DIR = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "routes",
  "marketplaces",
  "mp-price-stock",
);

/**
 * The screen's hooks are ONE BLOCK of a file the six screens of the section
 * share (`marketplace-section.tsx`); the block is cut out by its heading, so a
 * mutation another screen legitimately owns (the drafts of «Отзывы») does not
 * fail this screen's proof, and a mutation added to THIS block does.
 */
const SECTION_HOOKS = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "hooks",
  "api",
  "marketplace-section.tsx",
);

const priceStockBlock = (): string => {
  const source = readFileSync(SECTION_HOOKS, "utf8");
  const start = source.indexOf("* «Цены и остатки»");
  const end = source.indexOf("/* ----", start);
  return start === -1 ? "" : source.slice(start, end === -1 ? undefined : end);
};

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

const BACKEND_FILES = [...walk(HANDLER_DIR), ...DECISION_MODULES];
const PANEL_FILES = walk(PANEL_DIR);

/** Every panel source of the screen: its files, and its block of the shared hooks file. */
const PANEL_SOURCES: [string, string][] = [
  ...PANEL_FILES.map((file): [string, string] => [file, read(file)]),
  [`${SECTION_HOOKS} (блок «Цены и остатки»)`, priceStockBlock()],
];

describe("бэкенд-обработчики таблицы цен и остатков", () => {
  it("файлы на месте — иначе тест зелен ни о чём (правило 20a: ноль — не пусто)", () => {
    expect(walk(HANDLER_DIR).filter((file) => file.endsWith("route.ts"))).toHaveLength(3);
    for (const file of DECISION_MODULES) {
      expect(existsSync(file)).toBe(true);
    }
  });

  it("каждый файл price-stock/ в списке решений — иначе новый файл выпал бы из проверки", () => {
    expect(walk(path.join(MODULE_DIR, "price-stock")).sort()).toEqual(
      DECISION_MODULES.filter((file) => file.includes(`${path.sep}price-stock${path.sep}`)).sort(),
    );
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
  it("экран существует, и блок хуков найден", () => {
    expect(PANEL_FILES.length).toBeGreaterThanOrEqual(3);
    expect(priceStockBlock()).toMatch(/useMpPriceStock\b/);
    expect(priceStockBlock()).toMatch(/useMpPriceStockLines\b/);
  });

  it.each(PANEL_SOURCES)("%s не отправляет ни одной мутации", (_name, raw) => {
    const source = withoutComments(raw);

    expect(source).not.toMatch(/useMutation/);
    expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(source).not.toMatch(/sdk\.(?:admin|client)\.[\w.]*\.(?:create|update|delete)\b/);
  });

  it.each(PANEL_SOURCES)("%s не содержит кнопки правки числа площадки", (_name, raw) => {
    const source = withoutComments(raw);

    /*
     * Слова, которыми называется ПРАВКА цены или остатка на площадке. Кнопка
     * «Скачать в файл» и фильтры порогов — действия над НАШИМ экраном, и в
     * список не входят.
     */
    expect(source.toLowerCase()).not.toContain("отправить");
    for (const word of [
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

  it.each(PANEL_FILES)("%s: ни одного поля ввода — пороги стали фильтрами", (file) => {
    const source = withoutComments(read(file));

    expect(source).not.toMatch(/<Input\b|<input\b|<Textarea\b|contentEditable/);
  });
});
