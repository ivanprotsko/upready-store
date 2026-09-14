#!/usr/bin/env node
/**
 * accept-homepage.mjs — приёмка главной страницы на живом dev-сервере.
 *
 * Usage:
 *   node scripts/accept-homepage.mjs [--url http://localhost:5333/]
 *
 * Проверяет ровно то, что нельзя увидеть в статике: цикл слов героя, высоту
 * героя при смене слова, раскладку на 390 px, адреса всех CTA, тарифные
 * карточки (названия, отсутствие подписей строк и разделительных линий,
 * высоту одноимённых строк, переключатель периода оплаты, подсказки по
 * наведению — включая пробный период «Про» и включённые в «Ультра» товары),
 * отсутствие маркеров todo: и заглушек вместо цены, одиночный предпросмотр
 * секций и чистую консоль на обеих ширинах. Кадры кладёт в shots/out/.
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

    const ctaIds = [
      "hero-cta",
      "nav-cta",
      "plan-cta-free",
      "plan-cta-pro",
      "plan-cta-ultra",
      "final-cta",
    ];
    const hrefs = {};
    for (const id of ctaIds) hrefs[id] = await hrefOf(page, id);
    /* Решение Ивана от 2026-09-14 (PR #12): кнопки ведут в РАЗНЫЕ места —
       общие CTA и бесплатный тариф в мастер онбординга «/start/onboarding»,
       платные тарифы в телеграм-бот диплинком «?start=plan_N», где N — номер
       карточки. Проверяем каждый адрес по его назначению, а не все одним
       «/start/»: иначе диплинк бота прошёл бы мимо проверки. */
    const FUNNEL_CTA = ["hero-cta", "nav-cta", "plan-cta-free", "final-cta"];
    const BOT_CTA = { "plan-cta-pro": 2, "plan-cta-ultra": 3 };
    const ctaOk =
      FUNNEL_CTA.every(
        (id) => typeof hrefs[id] === "string" && hrefs[id].endsWith("/start/onboarding"),
      ) &&
      Object.entries(BOT_CTA).every(
        ([id, n]) =>
          typeof hrefs[id] === "string" &&
          /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=plan_\d$/.test(hrefs[id]) &&
          hrefs[id].endsWith(`?start=plan_${n}`),
      );
    check(
      "бесплатные CTA ведут в мастер онбординга, платные — диплинком в бота",
      ctaOk,
      ctaIds.map((id) => `${id}=${hrefs[id]}`).join(" · "),
    );

    /* Ссылка в бота обязана открываться в новой вкладке и с rel, закрывающим
       доступ к opener: это внешний домен. */
    const botTargets = await page.evaluate(
      (ids) =>
        ids.map((id) => {
          const a = document.querySelector(`[data-testid="${id}"]`);
          return a ? `${a.target}|${a.rel}` : "нет узла";
        }),
      Object.keys(BOT_CTA),
    );
    check(
      "кнопки платных тарифов открывают бота в новой вкладке с noopener",
      botTargets.every((t) => t === "_blank|noopener noreferrer"),
      botTargets.join(" · "),
    );

    /* ---------- тарифы (t-2026-09-14-01) ---------- */

    const PLAN_KEYS = ["free", "pro", "ultra"];
    const PLAN_NAMES = ["Новичок", "Профи", "Мастер"];

    const names = await page.$$eval("[data-testid^='plan-name-']", (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    );
    check(
      "в карточках стоят названия Новичок / Профи / Мастер",
      names.length === PLAN_NAMES.length && names.every((n, i) => n === PLAN_NAMES[i]),
      names.length === 0 ? "ни одного названия не найдено" : names.join(" · "),
    );

    /* Подписи строк убраны (приказ §3): в карточке не должно остаться ни
       списка определений, ни его терминов. */
    const labels = await page.evaluate(() =>
      ["free", "pro", "ultra"].reduce((total, key) => {
        const card = document.querySelector(`[data-testid="plan-${key}"]`);
        return total + (card ? card.querySelectorAll("dl, dt").length : 0);
      }, 0),
    );
    check(
      "в карточках тарифов нет подписей строк слева",
      labels === 0,
      `найдено элементов dl/dt: ${labels}`,
    );

    /* Карточки читаются как сравнение только пока одноимённые строки стоят на
       одной высоте: это замер, а не надежда на то, что копия не вырастет. */
    const rowTops = await page.evaluate(() => {
      const cards = ["free", "pro", "ultra"].map((key) =>
        document.querySelector(`[data-testid="plan-${key}"]`),
      );
      if (cards.some((card) => card === null)) return null;
      return cards.map((card) =>
        Array.from(card.querySelectorAll("li")).map((li) =>
          Math.round(li.getBoundingClientRect().top),
        ),
      );
    });
    const rowsAligned =
      rowTops !== null &&
      rowTops.every((tops) => tops.length === 5) &&
      [0, 1, 2, 3, 4].every((i) => {
        const column = rowTops.map((tops) => tops[i]);
        return Math.max(...column) - Math.min(...column) <= 1;
      });
    check(
      "одноимённые строки трёх карточек стоят на одной высоте (1440×900)",
      rowsAligned,
      rowTops === null
        ? "карточки не найдены"
        : rowTops.map((tops, i) => `${PLAN_KEYS[i]}=[${tops.join(",")}]`).join(" · "),
    );

    const ultraText = await page.$eval('[data-testid="plan-ultra"]', (node) => node.innerText);
    check(
      "у «Ультра» дизайн брендированный, а каталог неограниченный со сноской",
      /брендированный дизайн/.test(ultraText) && /Неограниченное количество товаров/.test(ultraText),
      ultraText.replace(/\s+/g, " ").slice(0, 120),
    );

    /* Условия переехали из сносок в подсказки по наведению (правка §5/§6):
       проверяем не наличие текста в разметке, а то, что он ПОКАЗЫВАЕТСЯ. */
    const tipOf = async (selector) => {
      await page.hover(selector).catch(() => null);
      await sleep(300);
      const text = await page
        .$eval(`${selector} [role="tooltip"]`, (node) => {
          const visible = getComputedStyle(node).visibility === "visible";
          return visible ? node.innerText.replace(/\s+/g, " ") : "";
        })
        .catch(() => null);
      await page.mouse.move(0, 0);
      await sleep(150);
      return text;
    };

    const badges = { pro: "3 дня бесплатно", ultra: "7 дней бесплатно" };
    for (const [key, lead] of Object.entries(badges)) {
      const badge = await page
        .$eval(`[data-testid="plan-trial-${key}"]`, (node) => node.innerText.replace(/\s+/g, " "))
        .catch(() => null);
      check(
        `у «${key === "pro" ? "Профи" : "Мастера"}» в углу карточки плашка «${lead}» с маркером`,
        badge !== null && badge.startsWith(lead) && /\d$/.test(badge.trim()),
        badge === null ? "плашки пробного периода нет" : badge,
      );

      const tip = await tipOf(`[data-testid="plan-trial-${key}"]`);
      const days = key === "pro" ? /Через 3 дня/ : /Через 7 дней/;
      check(
        `подсказка пробного периода «${key}» называет карту и автосписание в срок`,
        tip !== null &&
          /карт/i.test(tip) &&
          days.test(tip) &&
          /автоматически/.test(tip) &&
          /отменить/.test(tip),
        tip ? tip : "подсказка не раскрылась по наведению",
      );
    }

    /* Маркер сноски не должен попадать под пунктир значения: он стоит
       снаружи подчёркнутого узла (правка Ивана 2026-09-14). */
    const marksOutside = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="plan-"] sup')).every(
        (sup) => getComputedStyle(sup.parentElement).textDecorationLine === "none",
      ),
    );
    const marksCount = await page.$$eval('[data-testid^="plan-"] sup', (n) => n.length);
    check(
      "верхние индексы стоят снаружи пунктирного подчёркивания, и их четыре",
      marksOutside && marksCount === 4,
      `маркеров ${marksCount}, вне подчёркивания: ${marksOutside}`,
    );

    const catalogTip = await tipOf(
      '[data-testid="plan-ultra"] li:first-child [class*="hint"]',
    );
    check(
      "подсказка каталога «Мастера» называет 500 включённых товаров",
      catalogTip !== null && /500 товаров/.test(catalogTip),
      catalogTip ? catalogTip : "подсказка не раскрылась по наведению",
    );

    check(
      "блока сносок под карточками больше нет",
      (await page.$('[data-testid="plans-footnotes"]')) === null,
      "селектор plans-footnotes не найден",
    );

    /* Каждое значение обещает подсказку пунктиром — и обещание не пустое. */
    const hints = await page.evaluate(() =>
      ["free", "pro", "ultra"].flatMap((key) =>
        Array.from(
          document.querySelectorAll(`[data-testid="plan-${key}"] li [role="tooltip"]`),
        ).map((tip) => {
          const trigger = tip.parentElement;
          const decorated = getComputedStyle(trigger).textDecorationStyle === "dashed";
          return { text: tip.textContent.trim().length, decorated };
        }),
      ),
    );
    check(
      "у всех 15 значений есть подсказка и пунктирное подчёркивание",
      hints.length === 15 && hints.every((h) => h.decorated && h.text > 20),
      `значений с подсказкой: ${hints.length}, без пунктира: ${
        hints.filter((h) => !h.decorated).length
      }, с пустой подсказкой: ${hints.filter((h) => h.text <= 20).length}`,
    );

    /* Разделительных линий между строками не осталось (правка §4). */
    const rowBorders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="plan-"] li'))
        .map((li) => {
          const s = getComputedStyle(li);
          return parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
        })
        .reduce((a, b) => a + b, 0),
    );
    check(
      "между строками карточек нет разделительных линий",
      rowBorders === 0,
      `суммарная толщина рамок строк: ${rowBorders}px`,
    );

    /* Переключатель периода оплаты: смотрим не на клик, а на то, что цена
       и подпись под ней действительно меняются (правка §2/§3). */
    const priceOf = async (key) =>
      await page
        .$eval(`[data-testid="plan-price-${key}"]`, (n) => n.innerText.replace(/\s+/g, " "))
        .catch(() => null);
    const priceNoteOf = async (key) =>
      await page
        .$eval(`[data-testid="plan-price-note-${key}"]`, (n) => n.innerText.replace(/\s+/g, " "))
        .catch(() => null);

    const annualPro = await priceOf("pro");
    const annualNote = await priceNoteOf("pro");
    check(
      "по умолчанию выбран год: у «Профи» под ценой сказано «при оплате за год»",
      annualPro !== null && /458/.test(annualPro) && /при оплате за год/.test(annualNote ?? ""),
      `${annualPro} · ${annualNote}`,
    );

    await page.click('[data-testid="billing-monthly"]');
    await sleep(200);
    const monthlyPro = await priceOf("pro");
    const monthlyNote = await priceNoteOf("pro");
    check(
      "переключение на месяц даёт 699 ₽ и убирает строку про год",
      monthlyPro !== null &&
        /699/.test(monthlyPro) &&
        !/при оплате за год/.test(monthlyNote ?? ""),
      `${monthlyPro} · «${monthlyNote}»`,
    );
    await page.click('[data-testid="billing-annual"]');
    await sleep(200);

    const freePrice = await priceOf("free");
    check(
      "в бесплатном тарифе вместо 0 ₽ написано «Бесплатно»",
      freePrice !== null && /Бесплатно/.test(freePrice) && !/0\s*₽/.test(freePrice),
      String(freePrice),
    );

    const proText = await page.$eval('[data-testid="plan-pro"]', (n) => n.innerText);
    check(
      "у «Профи» две языковых версии, и старой строки про скидку за год нет",
      /две языковых версии/.test(proText) && !/−35\s*%/.test(proText),
      proText.replace(/\s+/g, " ").slice(0, 140),
    );

    const ctas = await page.$$eval("[data-testid^='plan-cta-']", (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    );
    check(
      "кнопки: «Создать магазин» у бесплатного и «Попробовать бесплатно» у двух платных",
      ctas.join(" · ") === "Создать магазин · Попробовать бесплатно · Попробовать бесплатно",
      ctas.join(" · "),
    );

    const freeText = await page.$eval('[data-testid="plan-free"]', (n) => n.innerText);
    check(
      "в бесплатном тарифе строка Telegram Mini App с маркером",
      /Telegram Mini App\s*1/.test(freeText.replace(/\s+/g, " ")),
      freeText.replace(/\s+/g, " ").slice(0, 140),
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    const todo = bodyText.match(/.{0,24}todo:.{0,24}/i);
    check(
      "на странице нет маркеров todo:",
      todo === null,
      todo === null ? "ни одного вхождения" : `найдено «${todo[0].trim()}»`,
    );

    /* Выдуманной цены на странице быть не должно (правило 17a): цифра сверх
       включённых товаров приходит из t-2026-09-14-02, а до тех пор сноска
       обходится без неё — и без заглушки на её месте. */
    const stub = bodyText.match(/.{0,24}(\bTBD\b|\bN\s*₽|X{2,}\s*₽|\{\{|_{3,}).{0,24}/i);
    check(
      "на странице нет заглушек вместо цены",
      stub === null,
      stub === null ? "ни одного вхождения" : `найдено «${stub[0].trim()}»`,
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
