import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES } from "../registry";

/**
 * THE READ-ONLY PROOF OF THE SELLER DASHBOARD (w19-mp-analytics).
 *
 * Ivan's standing invariant of 2026-09-16 02:46 WITA: analytics reads our own
 * tables and sends nothing. This screen is the one where breaking that would
 * be easiest to justify — the rating and the turnover both have a marketplace
 * method behind them — so the invariant is a test rather than a promise.
 *
 * Four belts:
 *
 *   1. The handler exports GET and nothing else.
 *   2. Nothing in the handler or in the pure modules can reach a marketplace:
 *      no `adapter.read(`, no `runSync`, no `fetch(`, and no
 *      `inspectCredentials` — the last one matters, because on Ozon it is a
 *      live `POST /v1/roles` and would turn every page open into a marketplace
 *      request. `readCredentials` is the one adapter member allowed: it reads
 *      our own database.
 *   3. The panel screen sends no mutation.
 *   4. The screen invents no profit: the words a P&L would be assembled from
 *      appear nowhere as a computed number.
 *
 * An endpoint ID is allowed to APPEAR in these files, unlike in the order
 * desk: the rating block looks the last recorded answer of
 * `analytics.item-rating` up in our own journal, and naming the method is the
 * point — the owner has to know which one was refused. Belt 2 is what makes
 * the name harmless.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

const HANDLER_DIR = path.join(
  REPO_ROOT,
  "apps",
  "backend",
  "src",
  "api",
  "tenants",
  "marketplace-analytics",
);

const CORE_MODULES = [
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "analytics.ts"),
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "analytics-sources.ts"),
];

const PANEL_DIR = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "routes",
  "settings",
  "marketplaces",
  "analytics",
);

const PANEL_HOOK = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "hooks",
  "api",
  "marketplace-analytics.tsx",
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
 * Comments are cut before the scan: this file and the handlers both NAME every
 * forbidden construct in prose, and a regex over raw source would find the
 * explanation and call it a defect (guard class 8b, "comment").
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("бэкенд дашборда", () => {
  const handlers = walk(HANDLER_DIR);

  it("файлы на месте — иначе тест зелен ни о чём (правило 20a)", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    expect(handlers.filter((file) => file.endsWith("route.ts"))).toHaveLength(1);
    for (const file of CORE_MODULES) {
      expect(existsSync(file)).toBe(true);
    }
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

  it.each([...walk(HANDLER_DIR), ...CORE_MODULES])("%s не может позвать площадку", (file) => {
    const source = withoutComments(read(file));

    expect(source).not.toMatch(/\.read\s*\(/);
    expect(source).not.toMatch(/\brunSync\b/);
    expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|\bgot\s*\(/);
    /*
     * inspectCredentials У OZON — ЭТО ЖИВОЙ POST /v1/roles. Один такой вызов в
     * загрузчике превратил бы каждое открытие экрана в запрос к площадке, и
     * экран перестал бы быть тем, чем он объявлен.
     */
    expect(source).not.toMatch(/\binspectCredentials\b/);
  });

  it.each([...walk(HANDLER_DIR), ...CORE_MODULES])(
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
    expect(MARKETPLACES.flatMap((adapter) => [...adapter.mutationDenyList]).length).toBeGreaterThan(
      0,
    );
  });
});

describe("экран панели", () => {
  const panelFiles = [...walk(PANEL_DIR), PANEL_HOOK].filter((file) => existsSync(file));

  it("экран существует", () => {
    expect(panelFiles.length).toBeGreaterThanOrEqual(3);
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
});

describe("выдуманной прибыли на экране нет", () => {
  it.each([...walk(HANDLER_DIR), ...CORE_MODULES, ...walk(PANEL_DIR)])(
    "%s не считает маржу и не оценивает прибыль",
    (file) => {
      const source = withoutComments(read(file));

      /*
       * Ни одного вычисления, которое выдавало бы себя за прибыль. Слова
       * «прибыль» и «маржа» разрешены в ТЕКСТЕ экрана — там они объясняют,
       * почему числа нет, — но не как имя переменной или поля, из которого
       * число потечёт в таблицу.
       */
      for (const name of ["margin", "profit", "cogs", "netProfit", "grossMargin"]) {
        expect(source).not.toMatch(new RegExp(`\\b(?:const|let|var)\\s+\\w*${name}\\w*\\s*=`, "i"));
        expect(source).not.toMatch(new RegExp(`\\b\\w*${name}\\w*\\s*:\\s*(?:number|\\d)`, "i"));
      }
    },
  );
});
