#!/usr/bin/env node
/**
 * accept-homepage.mjs — приёмка главной страницы на живом dev-сервере.
 *
 * Usage:
 *   node scripts/accept-homepage.mjs [--url http://localhost:5333/]
 *
 * Проверяет ровно то, что нельзя увидеть в статике: цикл слов героя, высоту
 * героя при смене слова, раскладку на 390 px, адреса всех CTA, отсутствие
 * маркеров todo:, одиночный предпросмотр секций и чистую консоль на обеих
 * ширинах. Кадры кладёт в shots/out/.
 *
 * Глазная приёмка (как это выглядит) остаётся за человеком: скрипт говорит
 * только про измеримое.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "/opt/homebrew/lib/node_modules/playwright/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "shots", "out");

/** Шаг цикла слов в герое (src/sections/hero/data.ts WORD_MS). */
const WORD_MS = 4000;
/** Момент первого замера: цикл ещё на первом слове. */
const EARLY_MS = 500;
/** Момент второго замера: цикл уже перешёл на следующее слово. */
const LATE_MS = WORD_MS + 500;

function parseArgs(argv) {
  const args = { url: "http://localhost:5333/" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.url) throw new Error("--url without a value");
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];

function check(name, ok, measured) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${measured}`);
}

/** Слушатели вешаются ДО первой навигации, иначе ранние ошибки теряются. */
function watch(page, bucket) {
  page.on("pageerror", (error) => bucket.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") bucket.push(`console.error: ${message.text()}`);
  });
}

function sectionUrl(base, slug) {
  const url = new URL(base);
  url.searchParams.set("section", slug);
  return url.toString();
}

/** Состояние подсветки: массив булевых по каждому слову заголовка. */
const highlighted = (page) =>
  page.$$eval("[data-hero-word]", (nodes) => nodes.map((node) => node.dataset.on === "true"));

const panelIndex = (page) =>
  page.$eval('[data-testid="hero-stage"]', (node) => Number(node.dataset.illIndex));

const heroHeight = (page) =>
  page.$eval('[data-section="hero"]', (node) =>
    Math.round(node.getBoundingClientRect().height),
  );

const hrefOf = async (page, testid) => {
  const element = await page.$(`[data-testid="${testid}"]`);
  return element ? element.getAttribute("href") : null;
};

/**
 * Открывает страницу и возвращает момент, от которого отсчитываются замеры
 * цикла: после монтирования героя и после загрузки шрифтов, иначе высота
 * героя меняется не от слова, а от подмены гарнитуры.
 */
async function openPage(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector('[data-hero-word][data-on="true"]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return Date.now();
}

async function waitUntil(start, offset) {
  await sleep(Math.max(0, offset - (Date.now() - start)));
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  mkdirSync(OUT, { recursive: true });
  console.log(`адрес: ${url}`);

  const browser = await chromium.launch();
  try {
    /* ---------- 1440×900 ---------- */
    const wideErrors = [];
    const wide = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
      deviceScaleFactor: 1,
    });
    const page = await wide.newPage();
    watch(page, wideErrors);

    const started = await openPage(page, url);

    await waitUntil(started, EARLY_MS);
    const early = await highlighted(page);
    const heroEarly = await heroHeight(page);
    const earlyIndex = early.indexOf(true);
    check(
      "на t≈0,5 с подсвечено ровно одно слово",
      early.filter(Boolean).length === 1,
      `подсвечено ${early.filter(Boolean).length} из ${early.length}, индекс ${earlyIndex}`,
    );

    await waitUntil(started, LATE_MS);
    const late = await highlighted(page);
    const heroLate = await heroHeight(page);
    const lateIndex = late.indexOf(true);
    check(
      "на t≈4,5 с подсвечено другое слово, и снова ровно одно",
      late.filter(Boolean).length === 1 && lateIndex !== earlyIndex,
      `подсвечено ${late.filter(Boolean).length}, индекс ${earlyIndex} → ${lateIndex}`,
    );
    check(
      "высота героя не изменилась при смене слова (1440×900)",
      heroEarly === heroLate,
      `${heroEarly}px → ${heroLate}px`,
    );

    /* Сначала закрепляем первое слово, чтобы «панель изменилась» была
       измерением, а не совпадением с тем, куда как раз доехал цикл. */
    await page.hover('[data-hero-word][data-k="0"]');
    await sleep(400);
    const panelBefore = await panelIndex(page);
    await page.hover('[data-hero-word][data-k="2"]');
    await sleep(400);
    const hovered = await highlighted(page);
    const panelAfter = await panelIndex(page);
    check(
      "наведение на третье слово подсвечивает его и меняет иллюстрацию",
      hovered[2] === true && hovered.filter(Boolean).length === 1 && panelAfter !== panelBefore,
      `слово 2 подсвечено=${hovered[2]}, подсвечено всего ${hovered.filter(Boolean).length}, панель ${panelBefore} → ${panelAfter}`,
    );
    await page.mouse.move(0, 0);

    const ctaIds = ["hero-cta", "nav-cta", "plan-cta-start", "plan-cta-business", "final-cta"];
    const hrefs = {};
    for (const id of ctaIds) hrefs[id] = await hrefOf(page, id);
    check(
      "каждый CTA ведёт в воронку",
      ctaIds.every((id) => typeof hrefs[id] === "string" && hrefs[id].includes("/start/")),
      ctaIds.map((id) => `${id}=${hrefs[id]}`).join(" · "),
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    const todo = bodyText.match(/.{0,24}todo:.{0,24}/i);
    check(
      "на странице нет маркеров todo:",
      todo === null,
      todo === null ? "ни одного вхождения" : `найдено «${todo[0].trim()}»`,
    );

    await page.screenshot({ path: path.join(OUT, "homepage-1440.png"), fullPage: true });

    for (const slug of ["hero", "words"]) {
      await page.goto(sectionUrl(url, slug), { waitUntil: "load" });
      const root = await page.waitForSelector(`[data-section="${slug}"]`, { timeout: 5000 }).catch(
        () => null,
      );
      check(
        `?section=${slug} рисует корень секции`,
        root !== null,
        root === null ? "корень не найден" : `[data-section="${slug}"] на месте`,
      );
    }

    check(
      "консоль чиста на 1440×900",
      wideErrors.length === 0,
      wideErrors.length === 0 ? "0 ошибок" : `${wideErrors.length}: ${wideErrors.join(" | ")}`,
    );
    await wide.close();

    /* ---------- 390×844 ---------- */
    const narrowErrors = [];
    const narrow = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "no-preference",
      deviceScaleFactor: 1,
    });
    const small = await narrow.newPage();
    watch(small, narrowErrors);

    const startedSmall = await openPage(small, url);

    await waitUntil(startedSmall, EARLY_MS);
    const heroEarlySmall = await heroHeight(small);
    const earlySmall = (await highlighted(small)).indexOf(true);

    await waitUntil(startedSmall, LATE_MS);
    const heroLateSmall = await heroHeight(small);
    const lateSmall = (await highlighted(small)).indexOf(true);
    check(
      "высота героя не изменилась при смене слова (390×844)",
      heroEarlySmall === heroLateSmall && earlySmall !== lateSmall,
      `слово ${earlySmall} → ${lateSmall}, высота ${heroEarlySmall}px → ${heroLateSmall}px`,
    );

    const scrollWidth = await small.evaluate(() => document.documentElement.scrollWidth);
    check("на 390 px страница не уезжает вбок", scrollWidth === 390, `scrollWidth = ${scrollWidth}`);

    const geometry = await small.evaluate(() => {
      const heading = document.querySelector('[data-section="hero"] h1');
      const panel = document.querySelector('[data-testid="hero-panel"]');
      if (!heading || !panel) return null;
      return {
        headingBottom: Math.round(heading.getBoundingClientRect().bottom),
        panelTop: Math.round(panel.getBoundingClientRect().top),
      };
    });
    check(
      "на 390 px панель стоит под заголовком",
      geometry !== null && geometry.panelTop >= geometry.headingBottom,
      geometry === null
        ? "заголовок или панель не найдены"
        : `низ h1 ${geometry.headingBottom}px, верх панели ${geometry.panelTop}px`,
    );

    await small.screenshot({ path: path.join(OUT, "homepage-390.png"), fullPage: true });

    check(
      "консоль чиста на 390×844",
      narrowErrors.length === 0,
      narrowErrors.length === 0 ? "0 ошибок" : `${narrowErrors.length}: ${narrowErrors.join(" | ")}`,
    );
    await narrow.close();
  } finally {
    await browser.close();
  }

  console.log(`кадры: ${path.join(OUT, "homepage-1440.png")}`);
  console.log(`кадры: ${path.join(OUT, "homepage-390.png")}`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log(`PASS — пройдено ${results.length} из ${results.length}`);
    return 0;
  }
  console.log(
    `FAIL — не пройдено ${failed.length} из ${results.length}: ${failed.map((r) => r.name).join("; ")}`,
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    console.log("FAIL — приёмка не доехала до конца");
    process.exit(1);
  },
);
