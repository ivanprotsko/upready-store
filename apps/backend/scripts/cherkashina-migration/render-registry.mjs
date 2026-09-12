// Renders 02-mapping-registry.md from 02-mapping-registry.json (rule 18b: JSON is the record).
import { readFileSync, writeFileSync } from "node:fs";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: render-registry.mjs <registry.json> <registry.md>");
  process.exit(2);
}
const r = JSON.parse(readFileSync(inPath, "utf8"));
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const by = (kind) => r.rows.filter((x) => x.kind === kind);
const L = [];
L.push(`# Реестр соответствий миграции chrxnasdmds → тенант ${r.tenant?.handle ?? "?"} (рендер из 02-mapping-registry.json)`, "");
L.push(`Обновлено ${r.updated_at}. Тенант: \`${r.tenant?.id}\` · handle \`${r.tenant?.handle}\` · канал \`${r.tenant?.sales_channel_id}\` · витрина ${r.tenant?.storefront_url} · владелец стенда ${r.tenant?.admin_email}.`, "");
L.push("## Сводка по видам", "", "| Вид | Всего | migrated | skipped | pending | failed |", "|---|---|---|---|---|---|");
for (const [k, s] of Object.entries(r.summary ?? {})) L.push(`| ${k} | ${s.total} | ${s.migrated ?? 0} | ${s.skipped ?? 0} | ${s.pending ?? 0} | ${s.failed ?? 0} |`);
L.push("", "## Товары: старый handle → новый, старый URL → новый, две пометки картинок", "", "| Источник (handle) | Цель (handle) | Статус | Картинка карточки (source) | Картинка по умолчанию на PDP (source) | Старый URL | Новый URL |", "|---|---|---|---|---|---|---|");
for (const p of by("product")) L.push(`| ${esc(p.source_handle)} | ${esc(p.target_handle)} | ${p.status} (${p.status_source}) | ${esc(p.card_image ?? "—")} | ${esc(p.pdp_default_image ?? "—")} | ${esc(p.source_url)} | ${esc(p.target_url)} |`);
L.push("", "## Категории", "", "| Источник | Цель | Статус | Старый URL | Новый URL |", "|---|---|---|---|---|");
for (const c of by("category")) L.push(`| ${esc(c.name)} (${esc(c.source_handle)}) | ${esc(c.target_handle)} | ${c.status} | ${esc(c.source_url)} | ${esc(c.target_url)} |`);
L.push("", "## Страницы", "", "| Источник | Локаль | Заголовок | Ключ tenant_page | Статус | Причина |", "|---|---|---|---|---|---|");
for (const p of by("page")) L.push(`| ${esc(p.source_handle ?? "—")} | ${esc(p.locale ?? "—")} | ${esc(p.title ?? "")} | ${esc(p.target_handle ?? "—")} | ${p.status} | ${esc(p.reason)} |`);
L.push("", "## Главная (баннеры)", "", "| Баннер | sort | Статус | Причина |", "|---|---|---|---|");
for (const b of by("banner")) L.push(`| ${esc(b.title)} | ${b.sort} | ${b.status} | ${esc(b.reason)} |`);
L.push("", "## Переводы товаров", "", "| Товар | Локаль | Статус | Причина |", "|---|---|---|---|");
for (const t of by("product_translation")) L.push(`| ${esc(t.source_handle)} | ${t.locale} | ${t.status} | ${esc(t.reason)} |`);
L.push("", "## Картинки без байтов / без картинок", "");
for (const i of by("image").filter((x) => x.status !== "migrated")) L.push(`- ${i.status}: ${esc(i.source_id)} (${esc(i.product_source_id)}) — ${esc(i.reason)}`);
L.push("", "## Цены со статусом не migrated", "");
const badPrices = by("price").filter((x) => x.status !== "migrated");
L.push(badPrices.length ? badPrices.map((p) => `- ${p.status}: ${esc(p.source_handle)} — ${esc(p.reason)}`).join("\n") : "- нет");
L.push("", "## Остальные наборы данных (2.4)", "", "| Набор | Кол-во | Статус | Рекомендация |", "|---|---|---|---|");
for (const d of by("dataset")) L.push(`| ${d.source_id} | ${d.count ?? "—"} | ${d.status} | ${esc(d.reason)} |`);
L.push("", "## Legacy-страницы pages.json", "");
L.push(by("legacy_page").map((p) => `- ${esc(p.source_handle)} — ${p.status}: ${esc(p.reason)}`).join("\n"));
writeFileSync(outPath, L.join("\n") + "\n");
console.log(`${r.rows.length} rows → ${outPath}`);
