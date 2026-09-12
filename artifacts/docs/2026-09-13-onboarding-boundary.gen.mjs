import fs from "node:fs"

const OUT = process.argv[2]
const STAMP = process.argv[3]

const WA = 62, WB = 64, WC = 46
const pad = (s, w) => { if (s.length > w) throw new Error(`строка шире ${w}: [${s.length}] ${s}`); return s + " ".repeat(w - s.length) }

/** Ряд воронки: хвост из ─ добивается до общей вертикали, затем ●─<коннектор>. */
const BAR = 46
const row = (left, conn) => left + "─".repeat(Math.max(0, BAR - 3 - left.length)) + "●─" + conn

const bar = (ch) => " ".repeat(BAR - 1) + ch
const toBar = (text, node) => " ".repeat(Math.max(0, BAR - text.length - 1)) + text + node

const A = []
A.push(" A · ДО — ВОРОНКА ПРОДАЖИ")
A.push(" продаём обещание; магазина ещё нет")
A.push("")
A.push(row(" /start ●─┬─① прямая оплата ", "┐"))
A.push(row("          ├─② услуга ─●─ тариф ", "┤"))
A.push(row("          ├─③ тариф ", "┤"))
A.push(row("          └─④ услуга ", "┤"))
A.push(bar("│"))
A.push(bar("▼"))
A.push(toBar("КАССА /start/pay ", "●") + "  approve →")
A.push(bar("│") + "  cookie paid")
A.push(toBar("прямая дверь /start/onboarding ─", "┤"))
A.push(bar("│") + "  та же дверь")
A.push(bar("└") + "──►  в мастер")
A.push("")
A.push(" ① 4 900 ₽ сразу · ② услуга→тариф · ③ тариф")
A.push(" ④ услуга (тариф у неё один) · ③ услугу подразумевает")
A.push(" касса судит по номеру карты: POST /api/demo/pay →")
A.push("   decline | redirect | approve. Денег нет: цена")
A.push("   демонстрационная, провайдера платежей нет")
A.push(" ▲ cookie paid мастер НЕ гейтит — он лишь добавляет")
A.push("   надпись «Оплачено: услуга, тариф» над шагом 1")

const B = []
B.push(" B · ОНБОРДИНГ — ТРИ ЭКРАНА И ЭКРАН ВЫДАЧИ")
B.push(" клиент уже наш; здесь появляется вещь, за которую платили")
B.push("")
B.push(" ┌ шаг 1 · МАГАЗИН ─────────────────────────────────────────┐")
B.push(" │ название  «Супершоп»  видно в шапке и во вкладке браузера│")
B.push(" │ адрес      supershop.<база>   транслит — лишь ПОДСКАЗКА, │")
B.push(" │            поле правится: [a-z0-9-], 3–63 знака          │")
B.push(" ├ шаг 2 · ДОСТУП ──────────────────────────────────────────┤")
B.push(" │ почта + пароль ≥ 8 — этой парой владелец войдёт в панель │")
B.push(" ├ шаг 3 · ОФОРМЛЕНИЕ ──────────────────────────────────────┤")
B.push(" │ тема: 7 пресетов, плашки красятся РЕАЛЬНЫМИ токенами темы│")
B.push(" │ режим по умолчанию: светлый | тёмный                     │")
B.push(" └───────────────────────────┬──────────────────────────────┘")
B.push("            [ Создать магазин ]  ← единственная запись на диск")
B.push("                             ▼  (что за ней — в блоке ниже)")
B.push(" ┌ ЭКРАН ВЫДАЧИ ────────────────────────────────────────────┐")
B.push(" │ «<Имя>» создан  ·  адрес витрины [Открыть]               │")
B.push(" │ панель управления [Войти]  ·  каталог: N товаров         │")
B.push(" │ тема не применилась / каталог пуст — СКАЗАНО, не скрыто  │")
B.push(" └──────────────────────────────────────────────────────────┘")

const C = []
C.push(" C · ПОСЛЕ — ЭТО УЖЕ НЕ ОНБОРДИНГ")
C.push(" магазин есть, владелец им управляет")
C.push("")
C.push(" ● витрина <handle>.<база> открыта покупателю")
C.push(" ● панель: товары, категории, заказы, промо")
C.push(" ● свой домен вместо поддомена")
C.push(" ● локаль, валюта, доставка, приём платежей")
C.push(" ● стартовый каталог заменяется своим")
C.push(" ● первый заказ")
C.push("")
C.push(" ▲ правило границы: всё, что владелец может")
C.push("   сделать ПОЗЖЕ и В ПАНЕЛИ — не онбординг.")
C.push("   Мастер не спрашивает то, что и так")
C.push("   меняется в два клика после входа.")

const h = Math.max(A.length, B.length, C.length)
while (A.length < h) A.push("")
while (B.length < h) B.push("")
while (C.length < h) C.push("")

const L = []
const rule = (ch) => ch.repeat(WA + WB + WC + 6)

L.push("╔" + "═".repeat(WA + WB + WC + 4) + "╗")
L.push("║ " + pad("ЧТО СЧИТАЕТСЯ ОНБОРДИНГОМ — граница, содержание и приёмка · upready-store · " + STAMP, WA + WB + WC + 2) + " ║")
L.push("║ " + pad("Нарисовано по коду, не по памяти: worktree feat/abstract-datasets (e370939). Адреса файлов — в подвале.", WA + WB + WC + 2) + " ║")
L.push("╚" + "═".repeat(WA + WB + WC + 4) + "╝")
L.push("")
for (let i = 0; i < h; i++) L.push(pad(A[i], WA) + " ║ " + pad(B[i], WB) + " ║ " + pad(C[i], WC))
L.push("")
L.push(rule("─"))
L.push(" ЗА КНОПКОЙ «СОЗДАТЬ МАГАЗИН» — POST /api/demo/onboarding. Работает на СЕРВЕРЕ: у /tenants нет CORS, из браузера эти шаги не позвать.")
L.push("")
L.push("   ① register ────────► ② POST /tenants ──────────► ③ login ──────► ④ POST /tenants/seed ─────► ⑤ PUT /tenants/home ─────► экран выдачи")
L.push("     токен владельца      тенант + канал продаж       сессия           стартовый каталог           тема, режим, раскладка      3 ссылки")
L.push("     почта занята —       + publishable key           владельца        «abstract» (под любую       h1/k/on/p3/f1, тексты       и баннеры")
L.push("     честный отказ        + склад + админ тенанта                      тему): 2 корневые + 5       героя + i18n.en, а")
L.push("                          + связи тенант↔канал↔ключ                    дочерних категорий,         картинка героя — из ④")
L.push("                                                                       10 товаров")
L.push("     ✗ упало здесь — магазина нет, дальше не идём     ✔ идемпотентно: непустой магазин не трогает  ▲ упало — не фатально: экран говорит, что")
L.push("                                                         и отвечает «уже не пуст»                     именно не вышло, и это чинится в панели")
L.push("")
L.push(rule("─"))
L.push(" ГРАНИЦА, КОТОРУЮ ФИКСИРУЕМ")
L.push("   НАЧАЛО  · первый экран мастера. Две двери ведут в одну и ту же комнату: approve на кассе и прямая ссылка. Оплата — НЕ часть онбординга.")
L.push("   КОНЕЦ   · экран выдачи, на котором владелец получил ТРИ вещи: адрес живой витрины · вход в панель · непустой каталог.")
L.push("             Пока хоть одна не выдана — онбординг НЕ завершён, даже если тенант в базе создан.")
L.push("   ВНУТРИ  · только то, без чего магазин не откроется: имя, адрес, вход владельца, облик.")
L.push("   СНАРУЖИ · выбор услуги и тарифа, деньги, свой домен, свои товары, налоги, доставка, языки — всё это панель.")
L.push("")
L.push(rule("─"))
L.push(" ЧЕМ ПРОВЕРЯЕМ, ЧТО ОНБОРДИНГ СОСТОЯЛСЯ — приёмка на живом стенде, прогоном мастера с начала, а не на макете")
L.push("   1 ✔ витрина отвечает 200 по своему адресу, в <title> — имя магазина")
L.push("   2 ✗ ссылка с экрана выдачи КЛИКАБЕЛЬНА в той среде, где мастер запущен          ← сегодня нарушено, дыра D1")
L.push("   3 ✔ владелец входит в панель той парой почта/пароль, что ввёл на шаге 2")
L.push("   4 ✔ каталог непустой: seeded=true, products > 0, картинки отдаются")
L.push("   5 ✔ тема применена: themeApplied=true, витрина открывается в выбранном режиме")
L.push("   6 ✔ повтор с той же почтой не плодит второй магазин, а честно отказывает")
L.push("")
L.push(rule("─"))
L.push(" ДЫРЫ И РАЗВИЛКИ — открыты, ждут твоего слова")
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
L.push(" ✔ так в коде сегодня      ▲ предложение — нужно твоё «да»      ✗ дефект, заведён и лечится      ● узел      ─┬─ ветвление")
L.push(" Код: apps/storefront/src/app/start/** (page, service, plan, pay, onboarding/wizard) · src/app/api/demo/{pay,onboarding}/route.ts ·")
L.push(" apps/backend/src/api/tenants/{route,seed,home}.ts · workflows/tenant/create-tenant · migration-scripts/data/abstract-datasets.ts")

const pre = L.join("\n")
if (L.length > 80) throw new Error(`высота ${L.length} строк — больше 80`)

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Что считается онбордингом — upready-store</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; background: #0d0f12; color: #d9dee5; }
  @media (prefers-color-scheme: light) { html, body { background: #fbfbf9; color: #1a1d21; } }
  pre {
    margin: 0;
    padding: 24px 28px 48px;
    font: 13px/1.28 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
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
const width = Math.max(...L.map((s) => s.length))
console.log(`строк: ${L.length} (лимит 80) · максимальная ширина: ${width} знаков · файл: ${OUT} (${fs.statSync(OUT).size} байт)`)
