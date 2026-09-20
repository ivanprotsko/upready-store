// Step 1 of the Cherkashina migration: measure the SOURCE database.
// Every number is written next to the exact SQL that produced it (rule 18b/17a).
//
//   node measure-source.mjs --db postgres://ivanprotsko@127.0.0.1:5433/medusa_chrxn \
//        --out ../../../../artifacts/docs/2026-09-12-cherkashina-migration/00-source-measure.json
//   node measure-source.mjs --psql "ssh cherkashina_store docker exec olavka-prod-postgres psql -U medusa -d medusa" --out live.json
//
// Read-only: only SELECTs are issued.
import { writeFileSync } from "node:fs";
import { cliDie, cliHelp } from "./lib/cli.mjs";
import { PSQL_DEFAULT, makePsql, stamp } from "./lib/psql.mjs";

const USAGE = `
measure-source.mjs — count the SOURCE store, every number next to the SQL that produced it.

  node measure-source.mjs (--db <postgres url> | --psql "<command>") --out <file.json> [--psql-bin <path>]

  --db        connection string of the SOURCE database (required unless --psql)
  --psql      a whole command that speaks psql, for a database behind ssh/docker
  --out       file the measurements are written to (required)
  --psql-bin  psql to run with --db; default \`${PSQL_DEFAULT}\` (env PSQL_BIN)

Writes: --out. Reads: the source database only (SELECT). Needs no backend.

  node measure-source.mjs --db postgres://ivanprotsko@127.0.0.1:5433/medusa_chrxn --out /tmp/00-source-measure.json
  node measure-source.mjs --psql "ssh cherkashina_store docker exec olavka-prod-postgres psql -U medusa -d medusa" --out /tmp/live.json
`;

const args = process.argv.slice(2);
cliHelp(args, USAGE);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const db = opt("--db", null);
const psqlCmd = opt("--psql", null);
const out = opt("--out", null);
if (!out || (!db && !psqlCmd)) {
  cliDie(USAGE, "required: --out, and one of --db / --psql");
}
const query = psqlCmd
  ? makePsql({ command: psqlCmd.split(" ")[0], args: psqlCmd.split(" ").slice(1) })
  : makePsql({ command: opt("--psql-bin", PSQL_DEFAULT), args: [db] });

const MEASURES = [
  ["product_total", "select count(*)::int as n from product where deleted_at is null"],
  ["product_by_status", "select status, count(*)::int as n from product where deleted_at is null group by status order by status"],
  ["product_deleted", "select count(*)::int as n from product where deleted_at is not null"],
  ["product_variant_total", "select count(*)::int as n from product_variant where deleted_at is null"],
  ["variants_per_product", "select cnt as variants, count(*)::int as products from (select product_id, count(*) cnt from product_variant where deleted_at is null group by product_id) x group by cnt order by cnt"],
  ["variant_manage_inventory", "select manage_inventory, count(*)::int as n from product_variant where deleted_at is null group by manage_inventory"],
  ["product_option_total", "select count(*)::int as n from product_option where deleted_at is null"],
  ["product_tag_total", "select count(*)::int as n from product_tag where deleted_at is null"],
  ["product_type_total", "select count(*)::int as n from product_type where deleted_at is null"],
  ["product_category_total", "select count(*)::int as n from product_category where deleted_at is null"],
  ["product_category_with_parent", "select count(*)::int as n from product_category where deleted_at is null and parent_category_id is not null"],
  ["product_category_product_links", "select count(*)::int as n from product_category_product"],
  ["products_without_category", "select count(*)::int as n from product p where p.deleted_at is null and not exists (select 1 from product_category_product c where c.product_id = p.id)"],
  ["product_collection_total", "select count(*)::int as n from product_collection where deleted_at is null"],
  ["products_in_collection", "select count(*)::int as n from product where deleted_at is null and collection_id is not null"],
  ["image_total", "select count(*)::int as n from image where deleted_at is null"],
  ["image_relative_products_path", "select count(*)::int as n from image where deleted_at is null and url like '/products/%'"],
  ["image_absolute_http", "select count(*)::int as n from image where deleted_at is null and url like 'http%'"],
  ["image_rank_distribution", "select rank, count(*)::int as n from image where deleted_at is null group by rank order by rank"],
  ["products_with_gallery", "select count(distinct product_id)::int as n from image where deleted_at is null"],
  ["products_without_gallery", "select p.handle, p.thumbnail from product p where p.deleted_at is null and not exists (select 1 from image i where i.product_id = p.id and i.deleted_at is null) order by p.handle"],
  ["products_with_thumbnail", "select count(*)::int as n from product where deleted_at is null and thumbnail is not null and thumbnail <> ''"],
  ["thumbnail_equals_gallery_rank0", "select count(*)::int as n from product p join image i on i.product_id = p.id and i.rank = 0 and i.deleted_at is null where p.deleted_at is null and p.thumbnail = i.url"],
  ["thumbnail_not_in_gallery", "select count(*)::int as n from product p where p.deleted_at is null and p.thumbnail is not null and not exists (select 1 from image i where i.product_id = p.id and i.url = p.thumbnail and i.deleted_at is null)"],
  ["region_rows", "select id, name, currency_code from region where deleted_at is null order by name"],
  ["store_currency", "select currency_code, is_default from store_currency order by currency_code"],
  ["price_by_currency", "select currency_code, count(*)::int as n from price where deleted_at is null group by currency_code order by currency_code"],
  ["price_list_total", "select count(*)::int as n from price_list where deleted_at is null"],
  ["prices_with_rules", "select count(distinct p.id)::int as n from price p join price_rule r on r.price_id = p.id where p.deleted_at is null"],
  ["rub_prices_per_variant", "select n as rub_prices, count(*)::int as variants from (select v.id, count(p.id) n from product_variant v left join product_variant_price_set vps on vps.variant_id = v.id left join price p on p.price_set_id = vps.price_set_id and p.currency_code = 'rub' and p.deleted_at is null where v.deleted_at is null group by v.id) x group by n order by n"],
  ["site_locale_rows", "select code, enabled, is_default from site_locale order by code"],
  ["product_translation_total", "select count(*)::int as n from product_translation"],
  ["product_translation_by_locale", "select locale, count(*)::int as n from product_translation group by locale order by locale"],
  ["product_translation_for_live_products", "select count(*)::int as n from product_translation t where exists (select 1 from product p where p.handle = t.product_handle and p.deleted_at is null)"],
  ["product_translation_for_deleted_products", "select count(*)::int as n from product_translation t where exists (select 1 from product p where p.handle = t.product_handle and p.deleted_at is not null)"],
  ["product_metadata_i18n", "select count(*)::int as n from product where deleted_at is null and metadata ? 'i18n'"],
  ["translation_by_resource_locale", "select resource, locale, count(*)::int as n from translation group by resource, locale order by resource, locale"],
  ["translation_ui_ru_by_prefix", "select p as prefix, count(*)::int as n from (select split_part(resource_key, '.', 1) p from translation where resource = 'ui' and locale = 'ru') x group by p order by n desc, p"],
  ["home_banner_total", "select count(*)::int as n from home_banner"],
  ["home_banner_active", "select count(*)::int as n from home_banner where active and deleted_at is null"],
  ["shipping_option_rows", "select id, name, provider_id, price_type from shipping_option where deleted_at is null order by name"],
  ["customer_total", "select count(*)::int as n from customer where deleted_at is null"],
  ["order_total", "select count(*)::int as n from \"order\" where deleted_at is null"],
  ["article_total", "select count(*)::int as n from article"],
  ["article_by_locale_status", "select locale, status, count(*)::int as n from article group by locale, status order by locale, status"],
  ["course_total", "select count(*)::int as n from course"],
  ["course_entitlement_total", "select count(*)::int as n from course_entitlement"],
  ["course_progress_total", "select count(*)::int as n from course_progress"],
  ["pickup_point_record_total", "select count(*)::int as n from pickup_point_record"],
  ["order_tracking_total", "select count(*)::int as n from order_tracking"],
  ["loyalty_gift_card_total", "select count(*)::int as n from loyalty_gift_card"],
  ["agent_conversation_total", "select count(*)::int as n from agent_conversation"],
  ["ai_image_generation_total", "select count(*)::int as n from ai_image_generation"],
  ["provider_identity_by_provider", "select provider, count(*)::int as n from provider_identity group by provider order by provider"],
  ["layout_configuration_total", "select count(*)::int as n from layout_configuration"],
];

const measured_at = stamp();
const result = { measured_at, source: db ?? psqlCmd, measures: {} };
let failed = 0;
for (const [name, sql] of MEASURES) {
  try {
    const rows = query(sql);
    const value = rows.length === 1 && Object.keys(rows[0]).length === 1 && "n" in rows[0] ? rows[0].n : rows;
    result.measures[name] = { sql, value };
  } catch (e) {
    failed += 1;
    result.measures[name] = { sql, error: String(e.stderr ?? e.message).trim().split("\n")[0] };
  }
}
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
const scalar = Object.entries(result.measures).filter(([, m]) => typeof m.value === "number");
console.log(`${measured_at}: ${Object.keys(result.measures).length} measures, ${failed} failed → ${out}`);
for (const [k, m] of scalar) console.log(`${k.padEnd(44)} ${m.value}`);
