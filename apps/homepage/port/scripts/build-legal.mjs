#!/usr/bin/env node
/*
 * build-legal.mjs — сборка правовых страниц upready.dev/terms, /offer, /privacy.
 *
 * Что делает: берёт три исходника из `docs/legal/*.md`, подставляет в них
 * значения из `docs/legal/requisites.json` и рендерит три самостоятельные
 * HTML-страницы в `dist/<slug>/index.html`. Внешних зависимостей нет: разметка
 * этих документов узкая (заголовки, абзацы с нумерацией пунктов, списки,
 * таблицы, **жирный** и `код`), и свой рендерер тут дешевле парсера.
 *
 * Главное свойство — ОТКАЗ. Опубликованный документ со строкой
 * `{{ЛИЦЕНЗИАР_ИНН}}` хуже отсутствующего: он выглядит как договор, но
 * называет сторону несуществующим именем. Поэтому пока хотя бы один
 * заполнитель пуст, ни одна страница не пишется — не «наполовину», а вообще.
 *
 * Режимы (различаются только тем, ЧЕМ заканчивается незаполненность):
 *   (без флагов)  мягкий. Не хватает данных → предупреждение и код 0,
 *                 страницы не написаны. Так генератор вызывается из
 *                 `vite build` (плагин legalPages в vite.config.ts): лендинг
 *                 обязан собираться и выкатываться, пока реквизитов нет.
 *   --require     жёсткий. Не хватает данных → сообщение и код 1. Так его
 *                 зовёт `pnpm build:legal` — то есть сборка, ради страниц и
 *                 затеянная. Именно этот режим стоит в CI перед публикацией.
 *   --check       диагностика. Ничего не пишет, печатает счёт заполненного и
 *                 список недостающего с файлом и строкой; код 1, если пусто.
 *
 * Опции: --requisites <файл> (по умолчанию docs/legal/requisites.json),
 *        --out <каталог> (по умолчанию <приложение>/dist).
 *
 * Пустое значение считается заполненным, только если имя ключа внесено в
 * массив `подтверждённо_пустые` файла реквизитов. У ИП не бывает КПП — это
 * осознанная пустота; забытое поле выглядит точно так же, и различить их
 * может только человек, поэтому различие вынесено в файл.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, ".."); // apps/homepage/port
const REPO_ROOT = resolve(APP_ROOT, "../../.."); // корень репозитория
const LEGAL_DIR = resolve(REPO_ROOT, "docs/legal");

const SITE = "https://upready.dev";

/**
 * Три документа и их постоянные адреса. `title` — то, что уходит в <title> и
 * в og:title: заголовок H1 оферты слишком длинен для вкладки браузера, а H1
 * страницы всё равно берётся из самого markdown, так что расхождения нет.
 */
const DOCS = [
  {
    slug: "terms",
    file: "user-agreement.md",
    title: "Пользовательское соглашение",
    description:
      "Правила пользования платформой Upready: аккаунт, что можно и что запрещено, блокировка, ответственность сторон.",
  },
  {
    slug: "offer",
    file: "public-offer.md",
    title: "Публичная оферта",
    description:
      "Лицензионный договор на использование платформы Upready: предмет лицензии, тарифы, оплата и автосписание, возврат, срок действия.",
  },
  {
    slug: "privacy",
    file: "privacy-policy.md",
    title: "Политика конфиденциальности",
    description:
      "Какие персональные данные обрабатывает Upready, зачем, кому передаёт, сколько хранит и какие права есть у субъекта данных.",
  },
];

/** Ссылки подвала правовых страниц — те же три документа плюс поддержка. */
const FOOTER_LINKS = [
  { label: "Соглашение", href: "/terms" },
  { label: "Оферта", href: "/offer" },
  { label: "Политика", href: "/privacy" },
];
const CONTACT = { label: "Связаться", href: "https://t.me/vladupready" };

// --------------------------------------------------------------------------
// Разбор аргументов
// --------------------------------------------------------------------------

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const optionValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const MODE_CHECK = has("--check");
const MODE_REQUIRE = has("--require");
/** Мягкий режим — тот, что не назван явно; он и стоит в `vite build`. */
const MODE_SOFT = !MODE_CHECK && !MODE_REQUIRE;

/*
 * Откуда берутся реквизиты, по убыванию старшинства: флаг `--requisites`,
 * переменная `LEGAL_REQUISITES`, файл по умолчанию. Переменная нужна затем,
 * что генератора внутри сборки зовёт плагин, и флаг туда не передать: она
 * позволяет прогнать сборку целиком на подставном наборе значений
 * (`LEGAL_REQUISITES=/tmp/проба.json pnpm build`), не подменяя настоящий файл.
 */
const requisitesPath = resolve(
  process.cwd(),
  optionValue("--requisites") ?? process.env.LEGAL_REQUISITES ?? resolve(LEGAL_DIR, "requisites.json"),
);
const outDir = resolve(process.cwd(), optionValue("--out") ?? resolve(APP_ROOT, "dist"));

/**
 * Путь для отчёта: внутри репозитория — короткий относительный, снаружи —
 * полный. Относительный путь, вылезающий за корень чередой `../`, читателя не
 * приводит никуда (правило 17c: адрес называется целиком).
 */
const rel = (p) => {
  const r = relative(REPO_ROOT, p);
  return !r || r.startsWith("..") ? p : r;
};
const say = (line = "") => process.stdout.write(`${line}\n`);
const warn = (line = "") => process.stderr.write(`${line}\n`);

// --------------------------------------------------------------------------
// Разметка → HTML
// --------------------------------------------------------------------------

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Строчная разметка. Код прячется первым и возвращается последним: иначе
 * ссылка или **жирный** внутри `обратных кавычек` были бы разобраны, хотя в
 * коде они — текст.
 */
function inline(src) {
  const code = [];
  let out = src.replace(/`([^`]+)`/g, (_, body) => {
    code.push(body);
    return ` CODE${code.length - 1} `;
  });

  out = escapeHtml(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, body) => `<strong>${body}</strong>`);
  // Голые адреса: markdown-ссылок в этих документах нет (проверено grep'ом),
  // адреса стоят текстом — и в таблицах, и в разделе реквизитов.
  out = out.replace(/https?:\/\/[^\s<»,;)]+[^\s<»,;).]/g, (url) => `<a href="${url}">${url}</a>`);
  out = out.replace(
    /[\w.+-]+@[\w-]+\.[\w.-]*[\w-]/g,
    (mail) => `<a href="mailto:${mail}">${mail}</a>`,
  );

  return out.replace(/ CODE(\d+) /g, (_, i) => `<code>${escapeHtml(code[Number(i)])}</code>`);
}

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_BULLET = /^[-*]\s+(.*)$/;
const RE_ORDERED = /^\d+\.\s+(.*)$/;
const RE_TABLE = /^\|(.*)\|\s*$/;
const RE_TABLE_RULE = /^\|[\s:|-]+\|\s*$/;
const RE_QUOTE = /^>\s?(.*)$/;
/**
 * Пункт договора: `1.2.`, `4.2.7.`. Требуется минимум одна внутренняя точка,
 * иначе правило съело бы обычный нумерованный список. Такая строка ВСЕГДА
 * начинает новый абзац: в оферте пункты 4.2.1–4.2.7 идут вплотную, без пустых
 * строк между ними, и без этого правила слились бы в один абзац.
 */
const RE_CLAUSE = /^\d+(?:\.\d+)+\.\s/;

/**
 * Ширина переноса. Документы свёрстаны по ~100 символов (замер: медиана 100,
 * 95-й перцентиль 108). Значит строка КОРОЧЕ этого порога, за которой абзац
 * продолжается, оборвана по смыслу, а не по ширине — так набран блок
 * реквизитов в конце и шапка «Редакция от…». За такой строкой ставится <br>,
 * за длинной — пробел.
 */
const SEMANTIC_BREAK_WIDTH = 80;

const isBlockStart = (line) =>
  !line.trim() ||
  RE_HEADING.test(line) ||
  RE_BULLET.test(line) ||
  RE_ORDERED.test(line) ||
  RE_TABLE.test(line) ||
  RE_QUOTE.test(line) ||
  RE_CLAUSE.test(line);

/** `## 15. Реквизиты и контакты` → `p-15`, чтобы на пункт можно было сослаться. */
function headingId(text, fallback) {
  const numbered = text.match(/^(\d+(?:\.\d+)*)\./);
  return numbered ? `p-${numbered[1]}` : `h-${fallback}`;
}

function renderMarkdown(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  const toc = [];
  let i = 0;
  let headingSeq = 0;
  let bannerDropped = false;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = line.match(RE_HEADING);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1) {
        // H1 рисует сама страница (в шапке документа), в поток он не идёт.
        i += 1;
        continue;
      }
      headingSeq += 1;
      const id = headingId(text, headingSeq);
      if (level === 2) toc.push({ id, text });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        body.push(lines[i].match(RE_QUOTE)[1]);
        i += 1;
      }
      // Первая цитата документа — редакционная врезка «Черновик к
      // заполнению», адресованная нам, а не читателю: она ссылается на файлы
      // репозитория и прямо говорит, что документ не публикуется. В публикацию
      // она не идёт. Любая другая цитата рисуется как цитата.
      if (!bannerDropped) {
        bannerDropped = true;
        continue;
      }
      html.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }

    if (RE_TABLE.test(line)) {
      const rows = [];
      while (i < lines.length && RE_TABLE.test(lines[i])) {
        if (!RE_TABLE_RULE.test(lines[i])) {
          rows.push(
            lines[i]
              .replace(/^\|/, "")
              .replace(/\|\s*$/, "")
              .split("|")
              .map((cell) => cell.trim()),
          );
        }
        i += 1;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
        const tb = body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("");
        html.push(
          `<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`,
        );
      }
      continue;
    }

    if (RE_BULLET.test(line) || RE_ORDERED.test(line)) {
      const ordered = !RE_BULLET.test(line) && RE_ORDERED.test(line);
      const re = ordered ? RE_ORDERED : RE_BULLET;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        const parts = [lines[i].match(re)[1]];
        i += 1;
        // Продолжение пункта: строка без собственного маркера и не начало блока.
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
          parts.push(lines[i].trim());
          i += 1;
        }
        items.push(`<li>${inline(parts.join(" "))}</li>`);
      }
      html.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    // Абзац: первая строка плюс все последующие, которые не начинают свой блок.
    const parts = [line.trim()];
    let previousWidth = line.length;
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      parts.push(previousWidth < SEMANTIC_BREAK_WIDTH ? `<br>${lines[i].trim()}` : lines[i].trim());
      previousWidth = lines[i].length;
      i += 1;
    }
    html.push(
      `<p>${inline(parts.join(" "))
        .replace(/\s*&lt;br&gt;\s*/g, "<br>")
        .trim()}</p>`,
    );
  }

  return { html: html.join("\n"), toc };
}

// --------------------------------------------------------------------------
// Страница
// --------------------------------------------------------------------------

/**
 * Стили страницы. Токены — копия `:root` из `src/styles/base.css` (палитра
 * Geist light), шапка и контейнер повторяют `src/App.module.css`, подвал —
 * `src/sections/shell/styles.module.css`. Копия, а не импорт: страница должна
 * быть самостоятельной — её отдаёт Cloudflare Pages по постоянному адресу и
 * открывают в том числе платёжный провайдер и юрист, без нашего JS.
 */
const STYLES = `
:root{--bg:#fafafa;--paper:#fff;--fg:#18181b;--muted:#52525b;--faint:#8f8f8f;--line:#e4e4e7;--secondary:#f4f4f5;--link:#2563eb;--r-sm:6px;--r-md:10px;--pad-x:clamp(20px,4vw,56px)}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:var(--link);text-decoration:none}
a:hover{color:var(--fg)}
::selection{background:var(--fg);color:#fff}
.mono{font-family:"Roboto Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.bar{position:sticky;top:0;z-index:40;height:60px;background:rgba(250,250,250,.85);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.bar-in{max-width:1280px;margin:0 auto;height:100%;background:rgba(255,255,255,.5);border-left:1px solid var(--line);border-right:1px solid var(--line);padding:0 var(--pad-x);display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{font-size:15.5px;font-weight:600;letter-spacing:-.02em;color:var(--fg)}
.barnav{display:flex;gap:20px;font-size:14px}
.barnav a{color:var(--muted)}
.barnav a:hover{color:var(--fg)}
.container{max-width:1280px;margin:0 auto;background:var(--paper);border-left:1px solid var(--line);border-right:1px solid var(--line)}
.doc{max-width:760px;margin:0 auto;padding:clamp(36px,5vw,72px) var(--pad-x) clamp(48px,6vw,88px)}
.eyebrow{font-family:"Roboto Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.doc h1{font-size:clamp(26px,3.2vw,36px);font-weight:600;letter-spacing:-.03em;line-height:1.15;margin:12px 0 0}
.meta{margin:14px 0 0;font-size:14px;color:var(--muted)}
.meta a{color:var(--muted);text-decoration:underline;text-underline-offset:2px}
.meta a:hover{color:var(--fg)}
.toc{margin:clamp(28px,4vw,40px) 0 0;padding:18px 22px;background:var(--secondary);border:1px solid var(--line);border-radius:var(--r-md)}
.toc p{margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--muted)}
.toc ol{margin:0;padding:0;list-style:none;columns:2;column-gap:28px;font-size:13.5px}
.toc li{margin:0 0 6px;break-inside:avoid}
.toc a{color:var(--muted)}
.toc a:hover{color:var(--fg)}
.body{margin-top:clamp(28px,4vw,40px);font-size:15.5px;line-height:1.68;color:var(--fg)}
.body h2{font-size:21px;font-weight:600;letter-spacing:-.02em;line-height:1.25;margin:44px 0 0;padding-top:20px;border-top:1px solid var(--line);scroll-margin-top:76px}
.body h3{font-size:17px;font-weight:600;margin:30px 0 0;scroll-margin-top:76px}
.body h4{font-size:15.5px;font-weight:600;margin:24px 0 0}
.body p{margin:14px 0 0}
.body ul,.body ol{margin:14px 0 0;padding-left:22px}
.body ul{list-style:disc}
.body li{margin:6px 0 0}
.body strong{font-weight:600}
.body code{font-family:"Roboto Mono",ui-monospace,monospace;font-size:.88em;background:var(--secondary);border:1px solid var(--line);border-radius:var(--r-sm);padding:1px 5px}
.body blockquote{margin:18px 0 0;padding:14px 18px;background:var(--secondary);border-left:2px solid var(--line);border-radius:0 var(--r-sm) var(--r-sm) 0;color:var(--muted)}
.tablewrap{margin:18px 0 0;overflow-x:auto;border:1px solid var(--line);border-radius:var(--r-md)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:11px 14px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
th{background:var(--secondary);font-weight:600;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
footer{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:26px var(--pad-x);max-width:1280px;margin:0 auto;background:var(--paper);border-left:1px solid var(--line);border-right:1px solid var(--line);border-top:1px solid var(--line);font-size:13px;color:var(--faint)}
footer nav{display:flex;gap:18px;flex-wrap:wrap}
footer a{color:var(--muted)}
footer a:hover{color:var(--fg)}
@media (max-width:768px){.barnav{display:none}}
@media print{.bar,.toc,footer{display:none}.container{border:0;max-width:none}.doc{max-width:none;padding:0}.body{font-size:11pt}.body h2{break-after:avoid}}
`.trim();

/*
 * Шапка страницы — надзаголовок и H1, и ничего больше. Дату редакции и
 * постоянный адрес документ называет сам, первым абзацем после заголовка
 * («Редакция от …», «Постоянный адрес документа: …»): это часть правового
 * текста, а не оформление. Продублировать их в шапке значило бы поставить
 * рядом два источника одной даты, которые однажды разойдутся.
 */
function renderPage(doc, { h1, bodyHtml, toc }) {
  const url = `${SITE}/${doc.slug}`;
  const titleTag = `${doc.title} — Upready`;
  const tocHtml = toc.length
    ? `<nav class="toc" aria-label="Содержание"><p>Содержание</p><ol>${toc
        .map((t) => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`)
        .join("")}</ol></nav>`
    : "";
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(titleTag)}</title>
    <meta name="description" content="${escapeHtml(doc.description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index,follow" />
    <meta name="theme-color" content="#fafafa" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Upready" />
    <meta property="og:locale" content="ru_RU" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(titleTag)}" />
    <meta property="og:description" content="${escapeHtml(doc.description)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Roboto+Mono:wght@400;500&display=swap"
    />
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="bar">
      <div class="bar-in">
        <a class="logo" href="${SITE}/">Upready</a>
        <nav class="barnav">
          ${FOOTER_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("\n          ")}
        </nav>
      </div>
    </div>
    <div class="container">
      <article class="doc">
        <header>
          <div class="eyebrow">Правовые документы</div>
          <h1>${inline(h1)}</h1>
        </header>
        ${tocHtml}
        <div class="body">
${bodyHtml}
        </div>
      </article>
    </div>
    <footer>
      <span>Upready · © 2026</span>
      <nav>
        ${FOOTER_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("\n        ")}
        <a href="${CONTACT.href}" target="_blank" rel="noopener">${CONTACT.label}</a>
      </nav>
    </footer>
  </body>
</html>
`;
}

// --------------------------------------------------------------------------
// Реквизиты и проверка заполненности
// --------------------------------------------------------------------------

const PLACEHOLDER = /\{\{([^}]+)\}\}/g;

function loadRequisites(path) {
  if (!existsSync(path)) {
    return { error: `файл реквизитов не найден: ${path}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { error: `файл реквизитов не разбирается как JSON (${path}): ${e.message}` };
  }
  const fields = parsed["поля"];
  if (!fields || typeof fields !== "object") {
    return { error: `в файле реквизитов нет объекта "поля": ${path}` };
  }
  const blankByDesign = new Set(
    Array.isArray(parsed["подтверждённо_пустые"]) ? parsed["подтверждённо_пустые"] : [],
  );
  return { fields, blankByDesign };
}

/** Где именно в документах встречается каждый заполнитель — с номерами строк. */
function collectPlaceholders(sources) {
  const seen = new Map(); // ключ → [{ file, line }]
  for (const { file, text } of sources) {
    text.split("\n").forEach((line, index) => {
      for (const m of line.matchAll(PLACEHOLDER)) {
        const key = m[1].trim();
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push({ file, line: index + 1 });
      }
    });
  }
  return seen;
}

function describeSites(sites) {
  const byFile = new Map();
  for (const s of sites) {
    if (!byFile.has(s.file)) byFile.set(s.file, []);
    byFile.get(s.file).push(s.line);
  }
  return [...byFile.entries()].map(([file, ls]) => `${file}:${ls.join(",")}`).join("  ");
}

// --------------------------------------------------------------------------
// Прогон
// --------------------------------------------------------------------------

function main() {
  const requisites = loadRequisites(requisitesPath);
  if (requisites.error) {
    warn(`build-legal: ${requisites.error}`);
    return MODE_SOFT ? 0 : 1;
  }
  const { fields, blankByDesign } = requisites;

  const sources = DOCS.map((doc) => {
    const path = resolve(LEGAL_DIR, doc.file);
    if (!existsSync(path)) throw new Error(`исходник документа не найден: ${path}`);
    return { doc, path, file: rel(path), text: readFileSync(path, "utf8") };
  });

  const used = collectPlaceholders(sources);

  /** Заполнитель стоит в тексте, но ключа под него в файле реквизитов нет. */
  const unknown = [];
  /** Ключ есть, но значение пустое и пустота не объявлена осознанной. */
  const missing = [];
  let filled = 0;

  for (const [key, sites] of used) {
    const field = fields[key];
    if (!field) {
      unknown.push({ key, sites });
      continue;
    }
    const value = typeof field["значение"] === "string" ? field["значение"] : "";
    if (value.trim() === "" && !blankByDesign.has(key)) {
      missing.push({ key, sites, hint: field["это"] ?? "", suggestion: field["рекомендация"] ?? "" });
      continue;
    }
    filled += 1;
  }

  const unused = Object.keys(fields).filter((k) => !used.has(k));

  // ---- отчёт --------------------------------------------------------------

  if (MODE_CHECK) {
    say(`build-legal --check`);
    say(`  реквизиты:  ${rel(requisitesPath)}`);
    say(`  документов: ${sources.length}`);
    say(`  заполнено:  ${filled} из ${used.size} заполнителей`);
    if (blankByDesign.size) say(`  осознанно пустых: ${[...blankByDesign].join(", ")}`);
    if (unused.length) say(`  ключей без места в тексте: ${unused.join(", ")}`);
  }

  if (unknown.length) {
    warn("");
    warn(
      `build-legal: в текстах стоят заполнители, которых нет в файле реквизитов (${unknown.length}):`,
    );
    for (const u of unknown) warn(`  {{${u.key}}}  ${describeSites(u.sites)}`);
    warn(`  Добавьте ключ в "поля" файла ${rel(requisitesPath)} либо уберите его из текста.`);
  }

  if (missing.length || unknown.length) {
    const total = missing.length + unknown.length;
    warn("");
    warn(
      MODE_SOFT
        ? `build-legal: ПРОПУСК — не заполнено ${total} из ${used.size} заполнителей, правовые страницы не собраны.`
        : `build-legal: ОТКАЗ — не заполнено ${total} из ${used.size} заполнителей, правовые страницы не собраны.`,
    );
    warn(`Заполнить: ${rel(requisitesPath)} (поле "значение" у каждого ключа)`);
    warn("");
    for (const m of missing) {
      warn(`  ${m.key}`);
      if (m.hint) warn(`      ${m.hint}`);
      if (m.suggestion) warn(`      предложено: ${m.suggestion}`);
      warn(`      ${describeSites(m.sites)}`);
    }
    warn("");
    warn(
      "Ни одна страница не записана намеренно: документ со строкой {{...}} на месте стороны договора хуже отсутствующего.",
    );
    if (MODE_SOFT) {
      warn(
        "Сборка лендинга продолжается (мягкий режим). Жёсткая проверка: pnpm build:legal — она падает с ненулевым кодом.",
      );
      return 0;
    }
    return 1;
  }

  if (MODE_CHECK) {
    say("");
    say("build-legal: все заполнители заполнены, страницы можно собирать.");
    return 0;
  }

  // ---- сборка -------------------------------------------------------------

  const revision = fields["ДАТА_РЕДАКЦИИ"]?.["значение"] ?? "";
  const written = [];

  for (const { doc, file, text } of sources) {
    const substituted = text.replace(PLACEHOLDER, (whole, rawKey) => {
      const key = rawKey.trim();
      const value = fields[key]?.["значение"];
      return typeof value === "string" ? value : whole;
    });

    // Пояс поверх подтяжек: даже если проверка выше чего-то не увидела,
    // страница с незакрытым местом не будет записана.
    const leftovers = [...substituted.matchAll(PLACEHOLDER)].map((m) => m[1]);
    if (leftovers.length) {
      warn(
        `build-legal: ВНУТРЕННЯЯ ОШИБКА — после подстановки в ${file} остались заполнители: ${leftovers.join(", ")}`,
      );
      return 1;
    }

    const h1 = (substituted.split("\n").find((l) => RE_HEADING.test(l)) ?? `# ${doc.title}`)
      .replace(RE_HEADING, "$2")
      .trim();
    const { html, toc } = renderMarkdown(substituted);
    const page = renderPage(doc, { h1, bodyHtml: html, toc, revision });

    if (page.includes("{{")) {
      warn(`build-legal: ВНУТРЕННЯЯ ОШИБКА — в готовой странице ${doc.slug} осталась строка "{{".`);
      return 1;
    }

    const target = resolve(outDir, doc.slug, "index.html");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, page, "utf8");
    written.push({ target, bytes: Buffer.byteLength(page), sections: toc.length });
  }

  say(`build-legal: собрано страниц — ${written.length}, редакция ${revision || "(без даты)"}`);
  for (const w of written) {
    say(`  ${rel(w.target)}  ${w.bytes} байт, разделов ${w.sections}`);
  }
  return 0;
}

/*
 * Исключение НЕ прощается даже в мягком режиме, и это не оговорка. Мягкий
 * режим прощает ровно одно — отсутствие данных, и этот случай разобран выше
 * явным возвратом 0. Исключение же означает, что сломан сам генератор: не
 * читается исходник, не разбирается разметка. Проглоти его — и сборка станет
 * зелёной при неработающем инструменте, то есть отличить «страниц нет, потому
 * что нет реквизитов» от «страниц нет, потому что генератор мёртв» станет
 * нечем. Поэтому причина уходит в stderr вместе со стеком, а код — ненулевой,
 * и `vite build` падает вместе с ним.
 */
try {
  process.exit(main());
} catch (e) {
  warn("");
  warn(`build-legal: СБОЙ ГЕНЕРАТОРА — ${e.message}`);
  warn("Это ошибка самого инструмента, а не отсутствие реквизитов: сборка остановлена во всех режимах.");
  if (e.stack) warn(e.stack);
  process.exit(1);
}
