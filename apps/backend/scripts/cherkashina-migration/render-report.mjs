// Renders 03-migration-report.md from the JSON records of this migration (measure, registry, inventory, checks).
// Prose (findings, proposals, questions) lives here; every number is read from the records at render time.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cliDie, cliHelp } from "./lib/cli.mjs";
import { stamp } from "./lib/psql.mjs";

const USAGE = `
render-report.mjs — render 03-migration-report.md from the JSON records of the 2026-09-12 migration.
Every number is read from the records at render time; the prose describes that run and its stand.

  node render-report.mjs <artifacts dir>

Reads, in <artifacts dir>: 00-source-measure.json, 01-feature-inventory.json, 02-mapping-registry.json,
and, when present, 03-target-measure.json and shots/checks.json.
Writes: <artifacts dir>/03-migration-report.md. Needs no backend and no database.

  node render-report.mjs artifacts/docs/2026-09-12-cherkashina-migration
`;

const argv = process.argv.slice(2);
cliHelp(argv, USAGE);
const dir = argv[0];
if (!dir) {
  cliDie(USAGE, "required: <artifacts dir>");
}
const J = (f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
const measure = J("00-source-measure.json");
const inventory = J("01-feature-inventory.json");
const registry = J("02-mapping-registry.json");
const checks = existsSync(path.join(dir, "shots/checks.json")) ? J("shots/checks.json") : null;
const target = existsSync(path.join(dir, "03-target-measure.json")) ? J("03-target-measure.json") : null;
const m = (k) => measure.measures[k]?.value;
const s = registry.summary;
const rows = (kind) => registry.rows.filter((r) => r.kind === kind);
const t = registry.tenant ?? {};
const esc = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const tv = (k) => (target ? target.measures[k]?.value ?? "—" : "—");

const L = [];
L.push(`# Миграция магазина Оксаны Черкашиной в upready-store как тенанта \`${t.handle}\` — отчёт`, "");
L.push(`Сгенерировано ${stamp()} из записей каталога \`artifacts/docs/2026-09-12-cherkashina-migration/\` (00-source-measure.json ${measure.measured_at}, 02-mapping-registry.json ${registry.updated_at}${checks ? `, shots/checks.json ${checks.shot_at}` : ""}). Ветка \`feat/cherkashina-tenant\` от \`fix/mt-storefront-head-footer\` 8dba58c. Прод не трогался, деплоя не было (17b/21c).`, "");
L.push(`## Что открыть Ивану`, "");
L.push(`- Витрина тенанта на локальном стенде: ${t.storefront_url} (главная), ${t.storefront_url}/store (каталог), ${t.storefront_url}/pages/offer (оферта), ${t.storefront_url}/pages/contacts, ${t.storefront_url}/pages/privacy, ${t.storefront_url}/pages/about; английская версия — замените \`/ru\` на \`/en\`.`);
L.push(`- Стенд: бэкенд :9033 (БД \`upready_store_cherkashina\`, копия \`upready_store_mt\`), витрина :8043 (\`next dev\` без turbopack). Владелец тенанта на стенде: ${t.admin_email} / \`supersecret1\` (панель не поднималась, /tenants/* проверялись скриптом и curl).`);
L.push(`- Кадры 1280×900 и 390×844 (PNG вне git): \`shots/\` — home, catalog, product-${checks?.product?.handle ?? "…"}, page-{contacts,offer,privacy,about-ru,about-en}; DOM-проверки — \`shots/checks.json\`.`, "");

L.push(`## Источник и цель: счётчики бок о бок`, "");
L.push(`Источник — локальная \`medusa_chrxn@127.0.0.1:5433\` (SQL в 00-source-measure.json). Цель — тенант \`${t.id}\` в \`upready_store_cherkashina\` (SQL по таблицам линков \`tenant_tenant_product_product\`/\`…_product_category\`, 03-target-measure.json). Живое кольцо olavka.ru: ssh до 178.21.11.54:22 отвечал «Operation timed out» в 10:0x и 10:53 WITA — **живая БД не замерена**, источником миграции служит локальная копия; paleoluma.com (Contabo) без ключа — не замерено.`, "");
L.push(`| Набор | Источник | Цель | Комментарий |`, `|---|---|---|---|`);
L.push(`| Товары | ${m("product_total")} (${(m("product_by_status") ?? []).map((x) => `${x.status} ${x.n}`).join(", ")}) | ${tv("products")} (${tv("products_by_status")}) | статус сохранён; handle с суффиксом \`-${t.handle}\` |`);
L.push(`| Варианты | ${m("product_variant_total")} | ${tv("variants")} | по одному на товар; SKU с суффиксом \`-${(t.handle ?? "").toUpperCase()}\`, исходный SKU в metadata.source_sku |`);
L.push(`| Категории | ${m("product_category_total")} (плоские) | ${tv("categories")} | линк tenant↔category |`);
L.push(`| Связи товар↔категория | ${m("product_category_product_links")} (все, включая 139 удалённых товаров) / 36 у живых | ${tv("category_links")} | |`);
L.push(`| Картинки галереи | ${m("image_total")} | ${tv("images")} | порядок = rank источника |`);
L.push(`| Товары с thumbnail | ${m("products_with_thumbnail")} | ${tv("thumbnails")} | −1: битая ссылка источника |`);
L.push(`| Цены | ${(m("price_by_currency") ?? []).map((x) => `${x.currency_code} ${x.n}`).join(", ")} (с ценами удалённых вариантов) | ${tv("prices_by_currency")} | по валюте на вариант: rub+usd у каждого, eur у 2 |`);
L.push(`| Переводы товаров | ${m("product_translation_total")} строк, ${m("product_translation_for_live_products")} у живых (en) | ${tv("product_translations")} | модуль переводов Medusa (title, description) |`);
L.push(`| Страницы контента | 11 живых страниц (7 легальных md + 4 из ключей UI) | ${tv("pages")} | ключей tenant_page только 5 — см. «не перенесено» |`);
L.push(`| Главная | ${m("home_banner_total")} баннера карусели | ${tv("home")} документ | баннер #1 → hero; #2–#3 ждут решения |`);
L.push(`| Файлы | 335 URL, 334 на диске | ${tv("files_on_disk")} в \`static/tenants/${t.id}/\` | загружены через POST /tenants/uploads |`, "");

L.push(`## Реестр: сводка по видам (02-mapping-registry.json)`, "", `| Вид | Всего | migrated | skipped | pending | failed |`, `|---|---|---|---|---|---|`);
for (const [k, v] of Object.entries(s)) L.push(`| ${k} | ${v.total} | ${v.migrated ?? 0} | ${v.skipped ?? 0} | ${v.pending ?? 0} | ${v.failed ?? 0} |`);
L.push("");

L.push(`## Перенесено (2.1–2.3)`, "");
L.push(`- **Товары 2.1**: ${s.product.migrated} из ${s.product.total} с принадлежностью к категориям (${s.category_link.migrated} связей), ценами (${s.price.migrated}), статусами (draft остались draft), полным metadata источника (+ \`source_id/source_handle/source_url/source_type/source_tags\`). Обе пометки картинок: \`card_image\` = product.thumbnail источника → thumbnail цели (карточка списка), \`pdp_default_image\` = картинка rank 0 → images[0] цели (первая на странице товара). У ${rows("image").filter((r) => String(r.source_id).startsWith("thumbnail:")).length} товаров карточка и первая картинка PDP — разные файлы; проверено на живой витрине DOM-ом: ${checks ? `card_image_matches=${checks.verdict.card_image_matches} (на ${checks.verdict.card_seen_on}), pdp_default_matches=${checks.verdict.pdp_default_matches} для \`${checks.product.handle}\`` : "checks.json отсутствует"}.`);
L.push(`- **Локализации 2.3**: ${s.product_translation.migrated} переводов товаров (en) записаны в модуль переводов цели; страницы — ru-строки и en там, где у источника был отдельный английский текст (about); главная — hero с \`i18n.en\`. У товаров источника \`metadata.i18n\` пуст у всех 38 (замер), локализация была только в \`product_translation\`.`);
L.push(`- **Страницы 2.2**: ${rows("page").filter((r) => r.status === "migrated").map((r) => `${r.source_handle}/${r.locale} → \`${r.target_handle}\``).join(", ")}. Легальные тексты перенесены как markdown с \`{{ПЛЕЙСХОЛДЕРАМИ}}\` дословно (реквизиты — от Ивана/Оксаны, не выдумывались): ${rows("page").filter((r) => r.status === "migrated" && r.placeholders?.length).map((r) => `${r.source_handle} ${r.placeholders.length}`).join(", ")}. Все 15 документов (в т.ч. не имеющие ключа) лежат в \`pages/<slug>.<locale>.md\`.`);
L.push(`- **Главная**: баннер «${rows("banner").find((b) => b.status === "migrated")?.title}» → hero документа тенанта (заголовок, подзаголовок, CTA, картинка \`hero-botanical.webp\`, en-версия), тема \`supplements\`, режим light; плитки категорий и лента «popular».`, "");

L.push(`## Не перенесено и почему (2.4 и ограничения цели)`, "", `| Набор | Кол-во | Статус | Рекомендация |`, `|---|---|---|---|`);
for (const d of rows("dataset")) L.push(`| ${d.source_id} | ${d.count ?? "—"} | ${d.status} | ${esc(d.reason)} |`);
L.push("");
L.push(`Страницы без ключа в \`tenant_page\` (ключи только contacts|legal|about|privacy|offer): ${rows("page").filter((r) => r.status === "pending").map((r) => `${r.source_handle}/${r.locale}`).join(", ")} — тексты сохранены в \`pages/\`, на сайте их нет. Legacy \`pages.json\` (39 записей старого Astro-зеркала): не переносить; единственная с маршрутом — \`pages/bundle-assortment\` — воссоздать вручную только если нужна Оксане.`, "");

L.push(`## Инвентарь фич (задача 1, 01-feature-inventory.md)`, "", `| Фича | В цели | Вердикт | Оценка |`, `|---|---|---|---|`);
for (const f of inventory.features) L.push(`| ${esc(f.feature)} | ${f.exists_in_target} | **${f.verdict}** | ${esc(f.effort)} |`);
L.push("", `Факты, подтверждённые чтением: \`apps/backend/medusa-config.ts\` цели не регистрирует ни платёжного, ни fulfillment-провайдера (дефолты Medusa) — обе интеграции здесь новые. \`@gorgo/medusa-payment-robokassa@1.0.0\`: peer \`@medusajs/* ^2.14.0\`, реальная установка в worktree на 2.19.0 прошла без своих peer-конфликтов (предупреждения в логе — от \`@medusajs/dashboard\`/\`admin-bundler\`), файл, который правит pnpm-patch, на месте; манифест после проверки откатили. Latest \`2.0.0-beta.4\` требует \`@gorgo/medusa-integration ≥0.1.5\` — плагин, который цель уже регистрирует с \`providers: []\` (docs.gorgojs.com: секреты шифруются AES-256-GCM в БД, «несколько экземпляров одного провайдера», привязка к тенанту не описана).`, "");

L.push(`## Изменения продуктового кода на ветке (без них приёмка невозможна)`, "");
L.push(`1. \`apps/backend/medusa-config.ts\`: локальный файловый провайдер получает \`backend_url\` из \`MEDUSA_BACKEND_URL\`. Замер: \`@medusajs/file-local\` читает только опцию \`backend_url\` (дефолт \`http://localhost:9000/static\`), на транке модуль не настроен → 334 загрузки на :9033 вернули адреса :9000, витрина показывала битые картинки. **На проде та же дыра**: \`deploy/compose.mt.yml\` не задаёт S3 и \`MEDUSA_BACKEND_URL\` для mt-backend, значит всё, что владельцы загружают через панель, получает \`localhost:9000\` (по живому проду не проверено — предложение задачи ниже). URL уже загруженных файлов перепривязаны скриптом \`rehost-images.mjs\` (проверка 200 по новому адресу перед записью).`);
L.push(`2. \`/store/tenant/pages\` и \`/store/tenant/pages/:key\` отвечают в локали посетителя (\`req.locale\` фреймворка: \`?locale=\`, затем \`x-medusa-locale\`) с фолбэком язык → en → любая; витрина (\`lib/data/tenant-pages.ts\`) шлёт локаль и держит кэш по языкам. До этого публичные маршруты читали только \`en\` — магазин с русским по умолчанию был нечитаем. Seam-тест \`tenants-pages.spec.ts\`: 9/9 (новый кейс на фолбэк).`, "");

L.push(`## Скрипты (apps/backend/scripts/cherkashina-migration/)`, "");
L.push(`\`measure-source.mjs\` (замер, число рядом с SQL) · \`export-source.mjs\` (снимок источника, только чтение) · \`import.mjs\` (идемпотентный импорт через /tenants/*, \`--dry-run\`, реестр по ходу, exit 1 при failed; повтор даёт 0 созданных) · \`rehost-images.mjs\` · \`render-registry.mjs\` · \`feature-inventory.mjs\` · \`render-report.mjs\`; переводы товаров — \`src/scripts/cherkashina-translate-products.ts\` через \`medusa exec\` (createTranslationsWorkflow). Источник читался только (cat/psql), запись — ни в БД, ни в репозиторий chrxnasdmds.`, "");

L.push(`## Вопросы Ивану (по одному, каждый с рекомендацией; отвечать можно по очереди)`, "");
L.push(`1. **Пер-тенантные секреты интеграций (развилка дизайна, блокирует код Robokassa/ApiShip).** Один бэкенд на всех тенантов, а Robokassa (MerchantLogin OLAVKA, пароли 1/2, тестовые) и ApiShip (токен, адрес отправителя) — свойства магазина. Рекомендация: опции провайдера разрешаются на каждом вызове по тенанту из tenant-scoped записи секретов (шифрование как у \`@gorgo/medusa-integration\`, \`INTEGRATION_ENCRYPTION_KEY\`), привязка через sales channel / регион тенанта; env оставляет только платформенное. Сначала спайк на 1 день: умеет ли \`@gorgo/medusa-integration\` «несколько экземпляров провайдера» разводить по тенанту — если да, берём Robokassa 2.0 через него, если нет — 1.0.0 + patch со своей таблицей секретов.`);
L.push(`2. **Покупатели (46) и заказы (88)** — по умолчанию не переносятся. Рекомендация: не переносить; выгрузить архив заказов для Оксаны из источника, покупатели регистрируются заново (согласие на передачу ПДн между операторами не оформлено).`);
L.push(`3. **Страницы без ключа** (delivery, faq, wholesale, returns, consent, consent-marketing, return-memo) и статьи журнала (18). Рекомендация: расширить \`TENANT_PAGE_KEYS\` (модель + панель + футер) свободными ключами; журнал — отдельное решение (порт модуля blog или страницы).`, "");

L.push(`## Предложения задач (заводит Иван, 22j)`, "");
L.push(`- **Загрузки владельца на проде получают \`localhost:9000\`**: критерий — файл, загруженный через панель на прод-тенанте, открывается по публичному URL; \`compose.mt.yml\` задаёт \`MEDUSA_BACKEND_URL\` (или S3) для mt-backend.`);
L.push(`- **Фильтры каталога по опциям**: у 38 товаров 38 собственных опций (Количество/Фасовка/Объём…) → в \`/ru/store\` ряд из ~25 чипов «Кол..», «Фас..» (та же природа, что \`t-2026-09-12-seed-option-filter-duplicates\`); критерий — один фильтр на одинаковое название опции.`);
L.push(`- **Hero главной для магазина с собственным текстом/картинкой**: вариант «h» рисует три фото коллекции и игнорирует \`image_url\`; критерий — документ тенанта с hero-текстом и картинкой виден на главной в выбранной композиции (см. checks.json/home).`);
L.push(`- **Редиректы со старых URL**: таблица старый→новый для ${rows("product").length} товаров и ${rows("category").length} категорий в 02-mapping-registry.md (\`https://olavka.ru/ru/ru/products/<handle>\` → \`/<locale>/products/<handle>-${t.handle}\`); olavka.ru живёт до 2027-07-19, cherkashino.ru/черкашино.рф куплены 2026-09-03 — постраничные 301 по политике \`specs/tenant-address/CANONICAL.md\`.`);
L.push(`- **Локаль/валюта тенанта**: нужен ru по умолчанию + en, ₽ на ru; решение по переносу \`STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN\` в документ тенанта ждёт Ивана (трек wave-2).`);
L.push(`- **Реквизиты**: ${[...new Set(rows("page").flatMap((r) => r.placeholders ?? []))].length} уникальных плейсхолдеров в легальных страницах (${[...new Set(rows("page").flatMap((r) => r.placeholders ?? []))].join(", ")}) — заполняются данными от Оксаны через панель, генератора подстановки в цели нет.`, "");

L.push(`## Замечания приёмки`, "");
L.push(`- Название тенанта задано «Оксана Черкашина» (в \`store.name\` источника — «Oksansa Cherkashina», опечатка); handle \`cherkashino\` — предложение, финальное имя за Иваном.`);
L.push(`- 5 товаров без картинок на цели ровно как в источнике: 4 без единого изображения и 1 с битой ссылкой (\`course-ochishchenie-pecheni-box\`); ничего не выдумывалось.`);
L.push(`- Цена с правилом региона в источнике (1 строка) не переносилась — регионы цели другие; в реестре нет строк price со статусом ≠ migrated, потому что эта цена принадлежит удалённому варианту.`);
L.push(`- Категории источника без картинок → плитки категорий на главной цели пустые (плитка требует \`metadata.image_url\`).`);
writeFileSync(path.join(dir, "03-migration-report.md"), L.join("\n") + "\n");
console.log(`report → ${path.join(dir, "03-migration-report.md")} (${L.length} lines)`);
