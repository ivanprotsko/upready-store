/**
 * Приёмка режима редактирования на живом стенде.
 * node scripts/accept-edit-mode.mjs <base-url> <cfg.json> <out-dir> <app package.json>
 *
 * Пример (стенд на 5311):
 *   node scripts/accept-edit-mode.mjs http://localhost:5311 "$PWD/public/homepage.cfg.json" /tmp/shots "$PWD/package.json"
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [BASE, CFG, OUT, PKG] = process.argv.slice(2);
const requireFromApp = createRequire(PKG);
const pptrModule = requireFromApp("puppeteer-core");
const puppeteer = pptrModule.default ?? pptrModule;
if (typeof puppeteer.launch !== "function") {
  throw new Error(`puppeteer.launch не функция; ключи: ${Object.keys(pptrModule).slice(0, 12).join(",")}`);
}
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const readCfg = () => JSON.parse(readFileSync(CFG, "utf8"));
const order = (cfg) => cfg.blocks.map((b) => b.slug);
const visible = (cfg) => cfg.blocks.filter((b) => b.visible).map((b) => b.slug);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/** Секции страницы: slug, призрак ли, и её сквозной номер (eyebrow «NN · …»). */
const domSections = (page) =>
  page.$$eval("[data-section]", (els) =>
    els
      .filter((el) => !el.dataset.section.startsWith("shell-"))
      .map((el) => {
        const hit = Array.from(el.querySelectorAll("span,div,p")).find((n) =>
          /^\d{2}\s*·/.test(n.textContent.trim()),
        );
        return {
          slug: el.dataset.section,
          ghost: !!el.closest("div[class*='ghost']"),
          num: hit ? hit.textContent.trim().slice(0, 2) : null,
        };
      }),
  );

const waitSaved = (page) =>
  page.waitForFunction(() => document.body.innerText.includes("сохранено"), { timeout: 8000 });

const hoverPanel = async (page, slug) => {
  await page.hover(`[data-section="${slug}"]`);
  await page.waitForFunction(
    (s) => {
      const btn = document.querySelector('button[aria-label="Поднять блок выше"]');
      return !!btn && btn.parentElement.innerText.includes(s);
    },
    { timeout: 5000 },
    slug,
  );
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

try {
  const before = readCfg();

  /* 1. Обычный режим: на странице ровно включённые блоки, нумерация сплошная. */
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const plain = await domSections(page);
  check(
    "обычный режим рендерит ровно включённые блоки",
    JSON.stringify(plain.map((s) => s.slug)) === JSON.stringify(visible(before)),
    `DOM: ${plain.map((s) => s.slug).join(",")}`,
  );
  /*
   * Проверки сквозной нумерации сняты 2026-09-13 вместе с блоками, которые
   * печатали надзаголовок «NN · Название»: ни одна секция нынешней вёрстки
   * номера не рисует, поэтому замер всегда вернул бы пустой список — а пустой
   * список не доказательство (правило 20a). Счётчик `numbering()` в
   * src/config/layout.ts жив и ждёт блока, которому номер снова понадобится;
   * тогда сюда возвращается и проверка.
   */
  check(
    "кнопка входа в режим есть на dev-стенде",
    (await page.$$eval("button", (b) => b.map((x) => x.innerText))).some((t) =>
      t.includes("Режим редактирования"),
    ),
    "кнопка «Режим редактирования»",
  );

  /* 2. Вход в режим: выключенные блоки видны призраками. */
  await page.goto(`${BASE}/?edit=1`, { waitUntil: "networkidle0" });
  const edit = await domSections(page);
  check(
    "в режиме редактирования выключенные блоки видны как призраки",
    JSON.stringify(edit.filter((s) => s.ghost).map((s) => s.slug)) ===
      JSON.stringify(before.blocks.filter((b) => !b.visible).map((b) => b.slug)),
    `призраки: ${edit.filter((s) => s.ghost).map((s) => s.slug).join(",")}`,
  );

  /* 3. Поповер по наведению. */
  await hoverPanel(page, "tariffs");
  const panelText = await page.$eval('button[aria-label="Поднять блок выше"]', (b) =>
    b.parentElement.innerText.replace(/\n/g, " · "),
  );
  check("поповер показывает блок под курсором", panelText.includes("tariffs"), `панель: ${panelText}`);
  await page.screenshot({ path: path.join(OUT, "01-popover.png") });

  /* 4. chevron-up переставляет блок и пишет файл. */
  const i0 = order(before).indexOf("tariffs");
  await page.click('button[aria-label="Поднять блок выше"]');
  await waitSaved(page);
  const afterUp = readCfg();
  check(
    "chevron-up поднял блок на одну позицию в файле",
    order(afterUp).indexOf("tariffs") === i0 - 1,
    `tariffs: ${i0} → ${order(afterUp).indexOf("tariffs")}`,
  );
  check(
    "порядок в DOM совпал с порядком в файле",
    JSON.stringify((await domSections(page)).map((s) => s.slug)) === JSON.stringify(order(afterUp)),
    "DOM = файл",
  );
  await page.screenshot({ path: path.join(OUT, "02-after-move.png") });

  /* 5. Второй клик подряд двигает ТОТ ЖЕ блок: перекомпоновка не должна
        переносить выбор на соседа, вставшего под неподвижный курсор. */
  await page.click('button[aria-label="Поднять блок выше"]');
  await waitSaved(page);
  const afterUp2 = readCfg();
  check(
    "два клика подряд двигают один и тот же блок",
    order(afterUp2).indexOf("tariffs") === i0 - 2,
    `tariffs: ${i0} → ${order(afterUp2).indexOf("tariffs")} (ожидалось ${i0 - 2})`,
  );

  /* 6. Возврат вниз теми же двумя кликами. */
  await page.click('button[aria-label="Опустить блок ниже"]');
  await waitSaved(page);
  await page.click('button[aria-label="Опустить блок ниже"]');
  await waitSaved(page);
  check(
    "возврат вниз вернул исходный порядок",
    JSON.stringify(order(readCfg())) === JSON.stringify(order(before)),
    "порядок совпал с исходным",
  );

  /* 7. Глаз выключает и включает блок. */
  await hoverPanel(page, "how");
  await page.click('button[aria-label="Скрыть блок"]');
  await waitSaved(page);
  const hidden = readCfg();
  check(
    "глаз выключил блок в файле",
    hidden.blocks.find((b) => b.slug === "how")?.visible === false,
    `how.visible = ${hidden.blocks.find((b) => b.slug === "how")?.visible}`,
  );
  const after = await domSections(page);
  check(
    "выключенный блок сразу стал призраком",
    after.find((s) => s.slug === "how")?.ghost === true,
    `призраки: ${after.filter((s) => s.ghost).map((s) => s.slug).join(",") || "нет"}`,
  );
  await page.screenshot({ path: path.join(OUT, "03-hidden.png") });
  await page.click('button[aria-label="Показать блок"]');
  await waitSaved(page);
  check(
    "тот же глаз вернул блок на страницу",
    readCfg().blocks.find((b) => b.slug === "how")?.visible === true,
    "how.visible = true",
  );

  /* 8. Раскладка переживает перезагрузку — читается из файла, а не из памяти. */
  await hoverPanel(page, "showcase");
  await page.click('button[aria-label="Поднять блок выше"]');
  await waitSaved(page);
  const moved = readCfg();
  await page.reload({ waitUntil: "networkidle0" });
  check(
    "после перезагрузки страница собрана по файлу",
    JSON.stringify((await domSections(page)).map((s) => s.slug)) === JSON.stringify(order(moved)),
    `DOM: ${(await domSections(page)).map((s) => s.slug).join(",")}`,
  );
  await hoverPanel(page, "showcase");
  await page.click('button[aria-label="Опустить блок ниже"]');
  await waitSaved(page);

  /* 9. Esc выходит из режима. */
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Поднять блок выше"]'), {
    timeout: 3000,
  });
  check("Esc выходит из режима", true, "панель и тулбар убраны");

  const final = readCfg();
  check(
    "конфиг после прогона равен исходному",
    JSON.stringify(final.blocks) === JSON.stringify(before.blocks),
    JSON.stringify(order(final)) === JSON.stringify(order(before)) ? "порядок и статусы совпали" : "РАЗОШЁЛСЯ",
  );
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\nИТОГ: ${results.length - failed} прошло, ${failed} упало`);
process.exit(failed === 0 ? 0 : 1);
