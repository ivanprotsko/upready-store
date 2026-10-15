import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { MARKETPLACES } from "../registry";

/**
 * THE READ-ONLY PROOF OF «Wildberries → Аналитика» (mp-section-design task-06,
 * first written for the w19-mp-analytics dashboard).
 *
 * Ivan's standing invariant of 2026-09-16 02:46 WITA: analytics reads our own
 * tables and sends nothing. This screen is the one where breaking that would
 * be easiest to justify — the rating and the stock both have a marketplace
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
 *   3. The panel screen, and the analytics block of the section's hook file,
 *      send no mutation.
 *   4. The screen invents no profit: the words a P&L would be assembled from
 *      appear nowhere as a computed number.
 *
 * An endpoint ID is allowed to APPEAR in these files, unlike in the order
 * desk: the rating looks the last recorded answer of `analytics.item-rating`
 * up in our own journal, and naming the method is the point — support has to
 * know which one was refused. Belt 2 is what makes the name harmless.
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
  "analytics",
);

/**
 * Every file of `analytics/` must be on this list, the way
 * `analytics/calendar.ts` is since t-2026-10-14-55; the second test below says
 * so, or a fold moved into a new file would leave the proof.
 */
const CORE_MODULES = [
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "analytics.ts"),
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "analytics-sources.ts"),
  path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "analytics", "calendar.ts"),
];

const PANEL_DIR = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "routes",
  "marketplaces",
  "mp-analytics",
);

/**
 * The hook file is shared by every screen of the section, and another screen
 * may keep a mutation of its own there; the belt reads the analytics block
 * only, from its header comment to the next one.
 */
const PANEL_HOOK = path.join(
  REPO_ROOT,
  "apps",
  "tenant-panel",
  "src",
  "hooks",
  "api",
  "marketplace-section.tsx",
);

const analyticsBlockOf = (source: string): string => {
  const title = source.indexOf("«Аналитика»: the seller's dashboard of one marketplace");
  if (title < 0) {
    return "";
  }
  const start = source.lastIndexOf("/* ----", title);
  const end = source.indexOf("/* ----", title);
  return source.slice(start, end < 0 ? undefined : end);
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

  it("каждый файл analytics/ в CORE_MODULES — иначе новый файл выпал бы из проверки", () => {
    const dir = path.join(REPO_ROOT, "apps", "backend", "src", "modules", "marketplace", "analytics");
    expect(walk(dir).sort()).toEqual(
      CORE_MODULES.filter((file) => file.startsWith(`${dir}${path.sep}`)).sort(),
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
  it("экран и блок хука существуют", () => {
    expect(walk(PANEL_DIR).length).toBeGreaterThanOrEqual(3);
    expect(analyticsBlockOf(read(PANEL_HOOK))).toMatch(/useMpAnalytics/);
  });

  it.each(walk(PANEL_DIR))("%s не отправляет ни одной мутации", (file) => {
    const source = withoutComments(read(file));

    expect(source).not.toMatch(/useMutation/);
    expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(source).not.toMatch(/sdk\.(?:admin|client)\.[\w.]*\.(?:create|update|delete)\b/);
  });

  it("блок «Аналитика» хука не отправляет ни одной мутации", () => {
    const source = withoutComments(analyticsBlockOf(read(PANEL_HOOK)));

    expect(source).not.toMatch(/useMutation/);
    expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  });
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
