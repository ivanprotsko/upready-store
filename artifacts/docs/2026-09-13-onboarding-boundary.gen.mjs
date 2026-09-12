import fs from "node:fs"

/**
 * Лента времени онбординга. Рисуется НА ХОЛСТЕ по координатам: слева — раньше,
 * справа — позже. Ширина строки не ограничена (страница скроллится по X),
 * высота тоже свободная. HTML руками не правится — только этот файл.
 */

const OUT = process.argv[2]
const STAMP = process.argv[3]

const W = 1100, H = 200
const g = Array.from({ length: H }, () => new Array(W).fill(" "))
let maxY = 0

const cells = (s) => [...s]

/** Кладёт текст, перезаписывая всё, что там было (подписи поверх линий). */
function stamp(x, y, s) {
  const a = cells(s)
  if (y < 0 || y >= H) throw new Error(`y=${y} вне холста: ${s}`)
  if (x < 0 || x + a.length > W) throw new Error(`x=${x}..${x + a.length} вне холста: ${s}`)
  for (let i = 0; i < a.length; i++) g[y][x + i] = a[i]
  if (y > maxY) maxY = y
}

/** Кладёт текст и БРОСАЕТ при наложении на чужие знаки — ловит перекос вёрстки. */
function put(x, y, s) {
  const a = cells(s)
  for (let i = 0; i < a.length; i++) {
    const c = g[y]?.[x + i]
    if (c !== undefined && c !== " " && c !== a[i]) {
      throw new Error(`наложение на (${x + i},${y}): было «${c}», кладём «${a[i]}» из [${s}]`)
    }
  }
  stamp(x, y, s)
}

const hline = (x1, x2, y, ch = "─") => { for (let x = x1; x <= x2; x++) stamp(x, y, ch) }

/** Вертикаль, которая сама разбирается с пересечением горизонталей. */
function vline(x, y1, y2, ch = "│") {
  for (let y = y1; y <= y2; y++) {
    const c = g[y][x]
    if (c === "─") stamp(x, y, ch === "║" ? "╫" : "┼")
    else if (c === " ") stamp(x, y, ch)
    else stamp(x, y, c)
  }
}

/** Рамка шириной w с заголовком в верхней грани. Возвращает высоту. */
function box(x, yTop, w, title, lines) {
  const head = title ? `┌ ${title} ` : "┌"
  const hl = cells(head).length
  if (hl > w - 2) throw new Error(`заголовок шире рамки: ${title}`)
  put(x, yTop, head + "─".repeat(w - hl - 1) + "┐")
  lines.forEach((ln, i) => {
    const len = cells(ln).length
    if (len > w - 3) throw new Error(`строка рамки шире ${w - 3}: [${len}] ${ln}`)
    put(x, yTop + 1 + i, "│ " + ln + " ".repeat(w - 3 - len) + "│")
  })
  put(x, yTop + lines.length + 1, "└" + "─".repeat(w - 2) + "┘")
  return lines.length + 2
}

/** Рамка, подвешенная НАД осью: нижняя грань на BOX_BOTTOM, ножка к узлу оси. */
function station(xLeft, w, title, lines) {
  const h = lines.length + 2
  box(xLeft, BOX_BOTTOM - h + 1, w, title, lines)
  const cx = xLeft + Math.floor(w / 2)
  stamp(cx, BOX_BOTTOM, "┬")
  for (let y = BOX_BOTTOM + 1; y < AX; y++) stamp(cx, y, "│")
  stamp(cx, AX, "●")
  return cx
}

// ─────────────────────────────────────────────────────────────── раскладка ───
const AX = 24          // главная ось времени
const BOX_BOTTOM = 20  // нижняя грань всех подвешенных рамок
const X_START = 4      // /start
const X_FORK = 8       // стояк ветвления воронки
const X_SERVICE = 40   // экран выбора услуги
const X_PLAN = 62      // экран выбора тарифа
const X_JOIN = 84      // сход веток
const X_PAY = 90       // касса
const B1 = 118         // граница: НАЧАЛО онбординга
const X_DIRECT = 112   // прямая дверь вливается в ось
const X_ENTER = 124    // мастер открылся
const X_AFTER_IN = 646 // вход в зону ПОСЛЕ
const B2 = 640         // граница: КОНЕЦ онбординга

// ────────────────────────────────────────────────────────────── ось времени ───
hline(2, 706, AX)
stamp(707, AX, "►")
stamp(X_START, AX, "●")

// ───────────────────────────────────────────────── воронка: четыре дорожки ───
const tracks = [
  { y: 14, head: "(1) прямая оплата", tail: [[28, "· цена 4 900 ₽ стоит прямо на /start"]], nodes: [] },
  { y: 16, head: "(2) услуга → тариф", tail: [], nodes: [[X_SERVICE, "● /start/service"], [X_PLAN, "● /start/plan"]] },
  { y: 18, head: "(3) только тариф", tail: [[28, "· услугу подразумевает"]], nodes: [[X_PLAN, "● /start/plan"]] },
  { y: 20, head: "(4) только услуга", tail: [[58, "· тариф у неё один"]], nodes: [[X_SERVICE, "● /start/service"]] },
]
for (const t of tracks) {
  hline(X_FORK, X_JOIN, t.y)
  stamp(X_FORK + 2, t.y, t.head + " ")
  for (const [x, label] of t.tail) stamp(x - 1, t.y, " " + label + " ")
  for (const [x, label] of t.nodes) stamp(x - 1, t.y, " " + label + " ")
}
// стояк у /start и сход у кассы
const yFork = tracks[0].y
for (let y = yFork; y < AX; y++) stamp(X_FORK, y, "│")
for (let y = yFork; y < AX; y++) stamp(X_JOIN, y, "│")
stamp(X_FORK, yFork, "├"); stamp(X_JOIN, yFork, "┤")
for (const t of tracks) { stamp(X_FORK, t.y, "├"); stamp(X_JOIN, t.y, "┤") }
stamp(X_FORK, AX, "┴"); stamp(X_JOIN, AX, "┴")
put(X_FORK - 2, yFork - 2, "четыре формы воронки — четыре разных пути до одной и той же кассы")
put(X_START - 2, AX + 1, "/start")
put(X_START - 2, AX + 2, "посетитель;")
put(X_START - 2, AX + 3, "магазина ещё нет")

// ───────────────────────────────────────────────────────────────────  касса ───
stamp(X_PAY, AX, "●")
put(X_PAY - 3, AX - 3, "КАССА /start/pay")
stamp(X_PAY, AX - 2, "│"); stamp(X_PAY, AX - 1, "│")
const payNote = [
  "вердикт выносит POST /api/demo/pay по номеру карты:",
  "► approve   ставит cookie paid — дверь открыта",
  "► redirect  банк просит подтверждение (карта 9999);",
  "            платит ВТОРОЙ вызов, с confirmed",
  "► decline   отказ, магазина нет",
  "▲ денег нет: цена демонстрационная, провайдера нет",
  "▲ cookie paid мастер НЕ гейтит — он лишь пишет",
  "  «Оплачено: услуга, тариф» над шагом 1",
]
payNote.forEach((s, i) => put(56, AX + 2 + i, s))

// ──────────────────────────────────────────────────── прямая дверь в мастер ───
const yDirect = AX + 12
hline(10, X_DIRECT, yDirect)
stamp(10, yDirect, "●")
put(12, yDirect - 1, "ПРЯМАЯ ДВЕРЬ /start/onboarding — ссылка без кассы: та же комната, тот же мастер")
stamp(X_DIRECT, yDirect, "┘")
for (let y = AX + 1; y < yDirect; y++) stamp(X_DIRECT, y, "│")
stamp(X_DIRECT, AX, "┴")

// ─────────────────────────────────────────────────────────── мастер: 3 шага ───
stamp(X_ENTER, AX, "●")
put(X_ENTER - 1, AX + 1, "мастер открылся")

station(130, 48, "ШАГ 1 · МАГАЗИН", [
  "название   «Супершоп»",
  "           видно в шапке и во вкладке",
  "адрес      supershop.<база>",
  "           транслит — только ПОДСКАЗКА,",
  "           поле правится: [a-z0-9-], 3–63",
])
station(184, 48, "ШАГ 2 · ДОСТУП", [
  "почта      ею владелец войдёт в панель",
  "пароль     не короче 8 знаков",
  "           это и есть админ тенанта",
])
station(238, 48, "ШАГ 3 · ОФОРМЛЕНИЕ", [
  "тема       7 пресетов; плашки красятся",
  "           РЕАЛЬНЫМИ токенами темы",
  "режим      светлый | тёмный",
])
put(154, AX + 1, "три экрана одной формы: назад-вперёд без потери введённого")

// ───────────────────────────────────────────────────────────────── кнопка ───
const X_BTN = 300
stamp(X_BTN, AX, "●")
put(X_BTN - 10, AX - 2, "[ Создать магазин ]")
put(X_BTN - 10, AX + 3, "ЕДИНСТВЕННАЯ запись на диск за весь мастер:")
put(X_BTN - 10, AX + 4, "до неё всё живёт в форме, в браузере")

// ──────────────────────────────────────────────── серверная цепочка из пяти ───
put(320, 6, "ЗА КНОПКОЙ — POST /api/demo/onboarding. Работает на СЕРВЕРЕ: у /tenants нет CORS, из браузера эти шаги не позвать")
station(320, 46, "1 · register", [
  "токен владельца.",
  "почта занята — честный отказ,",
  "дальше не идём",
])
station(370, 46, "2 · POST /tenants", [
  "тенант + канал продаж",
  "+ publishable key",
  "+ склад + админ тенанта",
  "+ связи тенант↔канал↔ключ",
])
station(420, 46, "3 · login", [
  "сессия владельца —",
  "ею подписаны шаги 4 и 5",
])
station(470, 48, "4 · POST /tenants/seed", [
  "стартовый каталог «abstract»",
  "(подходит под ЛЮБУЮ тему):",
  "2 корневые + 5 дочерних категорий,",
  "10 товаров",
])
station(524, 48, "5 · PUT /tenants/home", [
  "тема, режим, раскладка h1/k/on/p3/f1,",
  "тексты героя + i18n.en;",
  "картинка героя — из шага 4",
])
put(322, AX + 5, "✗ упало здесь — магазина нет, дальше не идём")
put(472, AX + 5, "✔ идемпотентно: непустой магазин не трогает, отвечает «уже не пуст»")
put(472, AX + 7, "▲ упало на 5 — не фатально: экран говорит, что именно не вышло, и это чинится в панели")

// ───────────────────────────────────────────────────────────── экран выдачи ───
station(580, 54, "ЭКРАН ВЫДАЧИ", [
  "1 · адрес витрины       [Открыть]",
  "2 · панель управления   [Войти]",
  "3 · каталог: N товаров",
  "тема не применилась / каталог пуст —",
  "это СКАЗАНО на экране, а не скрыто",
])

// ─────────────────────────────────────────────────────────────────── ПОСЛЕ ───
stamp(X_AFTER_IN, AX, "●")
station(652, 58, "ПОСЛЕ — это уже не онбординг", [
  "витрина <handle>.<база> открыта покупателю",
  "панель: товары, категории, заказы, промо",
  "свой домен вместо поддомена",
  "локаль, валюта, доставка, приём платежей",
  "стартовый каталог заменяется своим",
  "первый заказ",
])
put(652, AX + 2, "▲ правило границы: всё, что владелец может сделать ПОЗЖЕ и В ПАНЕЛИ, — не онбординг.")
put(652, AX + 3, "  Мастер не спрашивает того, что меняется в два клика после входа.")

// ────────────────────────────────────────────────────────── границы и зоны ───
const yBottom = maxY + 1
for (const x of [B1, B2]) vline(x, 1, yBottom, "║")
put(B1 + 3, 3, "◄ НАЧАЛО ОНБОРДИНГА · первый экран мастера; обе двери ведут в одну и ту же комнату")
put(B2 - 39, 3, "КОНЕЦ ОНБОРДИНГА · три вещи выданы ►")

hline(2, B1 - 1, 1)
hline(B1 + 1, B2 - 1, 1)
hline(B2 + 1, 710, 1)
stamp(4, 1, " ДО · ВОРОНКА ПРОДАЖИ — продаём обещание, магазина ещё нет ")
stamp(B1 + 4, 1, " ОНБОРДИНГ — вот эту границу мы и фиксируем: от первого экрана мастера до трёх выданных вещей ")
stamp(B2 + 4, 1, " ПОСЛЕ — магазин есть, владелец им управляет ")

stamp(2, 0, "ВРЕМЯ ► слева — раньше, справа — позже; расстояние по горизонтали = порядок событий, не минуты")

// ─────────────────────────────────────────────────────── сборка страницы ───
const belt = g.slice(0, yBottom + 1).map((row) => row.join("").replace(/\s+$/, ""))

const L = []
L.push("ЧТО СЧИТАЕТСЯ ОНБОРДИНГОМ — граница, содержание и приёмка · upready-store · " + STAMP)
L.push("Нарисовано по коду, не по памяти: worktree feat/abstract-datasets (e370939). Адреса файлов — в подвале.")
L.push("")
L.push(...belt)
L.push("")

const rule = (ch) => ch.repeat(120)
L.push(rule("═"))
L.push(" ГРАНИЦА, КОТОРУЮ ФИКСИРУЕМ")
L.push("")
L.push("   НАЧАЛО  · первый экран мастера. Две двери ведут в одну и ту же комнату: approve на кассе и прямая ссылка /start/onboarding.")
L.push("             Оплата — НЕ часть онбординга.")
L.push("   КОНЕЦ   · экран выдачи, на котором владелец получил ТРИ вещи: адрес живой витрины · вход в панель · непустой каталог.")
L.push("             Пока хоть одна не выдана — онбординг НЕ завершён, даже если тенант в базе создан.")
L.push("   ВНУТРИ  · только то, без чего магазин не откроется: имя, адрес, вход владельца, облик.")
L.push("   СНАРУЖИ · выбор услуги и тарифа, деньги, свой домен, свои товары, налоги, доставка, языки — всё это панель.")
L.push("")
L.push(rule("─"))
L.push(" ЧЕМ ПРОВЕРЯЕМ, ЧТО ОНБОРДИНГ СОСТОЯЛСЯ — приёмка на живом стенде, прогоном мастера с начала, а не на макете")
L.push("")
L.push("   1 ✔ витрина отвечает 200 по своему адресу, в <title> — имя магазина")
L.push("   2 ✗ ссылка с экрана выдачи КЛИКАБЕЛЬНА в той среде, где мастер запущен          ← сегодня нарушено, дыра D1")
L.push("   3 ✔ владелец входит в панель той парой почта/пароль, что ввёл на шаге 2")
L.push("   4 ✔ каталог непустой: seeded=true, products > 0, картинки отдаются")
L.push("   5 ✔ тема применена: themeApplied=true, витрина открывается в выбранном режиме")
L.push("   6 ✔ повтор с той же почтой не плодит второй магазин, а честно отказывает")
L.push("")
L.push(rule("─"))
L.push(" ДЫРЫ И РАЗВИЛКИ — открыты, ждут твоего слова")
L.push("")
L.push("   D1 ✗ схема https:// вшита константой: apps/storefront/src/app/api/demo/onboarding/route.ts:238. На стенде без TLS ссылка мертва")
L.push("         (замер: curl rc=35, TLS-ответа нет вовсе). Задача t-2026-09-12-03; лечение — схема из окружения или из протокола запроса.")
L.push("   D2 ▲ сертификат выпускается ~70 с (замер 2026-09-11): кнопка «Открыть» активна раньше, чем адрес отвечает по TLS. Держать её")
L.push("         неактивной до первого удачного ответа — или показывать отсчёт? Сейчас экран предупреждает текстом, но пускает сразу.")
L.push("   D3 ▲ оплата демонстрационная: провайдера нет, вердикт выносит /api/demo/pay по номеру карты. Для боевого — Tribute/Polar.")
L.push("   D4 ▲ сфера торговли и торговые категории (канон specs/catalog-taxonomy/GLOSSARY.md) в мастере НЕ спрашиваются, поэтому набор один —")
L.push("         «abstract» под любую тему. Спрашивать ли сферу на онбординге, чтобы каталог сразу был релевантным, — твоё решение.")
L.push("   D5 ▲ какая из четырёх воронок станет боевой — не выбрано (вопрос q-homepage-funnel-variant).")
L.push("")
L.push(rule("═"))
L.push(" ✔ так в коде сегодня      ▲ предложение — нужно твоё «да»      ✗ дефект, заведён и лечится      ● узел      ║ граница онбординга")
L.push(" Код: apps/storefront/src/app/start/** (page, service, plan, pay, onboarding/wizard) · src/app/api/demo/{pay,onboarding}/route.ts ·")
L.push(" apps/backend/src/api/tenants/{route,seed,home}.ts · workflows/tenant/create-tenant · migration-scripts/data/abstract-datasets.ts")

const pre = L.join("\n")

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Что считается онбордингом — upready-store</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; background: #fbfaf7; color: #15181c; }
  pre {
    margin: 0;
    padding: 28px 32px 64px;
    font: 13px/1.32 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    white-space: pre;
    overflow-x: auto;
    tab-size: 4;
  }
</style>
</head>
<body>
<pre>
${pre.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
</pre>
</body>
</html>
`

fs.writeFileSync(OUT, html)
const width = Math.max(...L.map((s) => cells(s).length))
console.log(`строк: ${L.length} · максимальная ширина: ${width} знаков · файл: ${OUT} (${fs.statSync(OUT).size} байт)`)
