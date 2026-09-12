// Step 3 (input): export the SOURCE catalog + content from medusa_chrxn as one JSON snapshot.
// Text data only (URLs, not bytes). Read-only on the source (rule 17b: never a write).
//
//   node export-source.mjs --db postgres://ivanprotsko@127.0.0.1:5433/medusa_chrxn \
//        --out ../../../../artifacts/docs/2026-09-12-cherkashina-migration/source-snapshot.json
import { writeFileSync } from "node:fs";
import { makePsql, stamp } from "./lib/psql.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const db = opt("--db", null);
const out = opt("--out", null);
if (!db || !out) {
  console.error("usage: --db <url> --out <file.json>");
  process.exit(2);
}
const q = makePsql({ args: [db] });

const snapshot = {
  exported_at: stamp(),
  source: db,
  products: q(`select id, handle, title, subtitle, description, status, thumbnail, collection_id, type_id,
                      weight, length, height, width, hs_code, origin_country, mid_code, material, discountable,
                      is_giftcard, metadata, created_at, updated_at
               from product where deleted_at is null order by created_at, id`),
  variants: q(`select id, product_id, title, sku, barcode, ean, upc, allow_backorder, manage_inventory,
                      weight, length, height, width, hs_code, origin_country, mid_code, material, metadata, variant_rank
               from product_variant where deleted_at is null order by product_id, variant_rank, id`),
  options: q(`select o.id, ppo.product_id, o.title, o.is_exclusive, o.metadata,
                     (select json_agg(json_build_object('id', v.id, 'value', v.value, 'rank', v.rank) order by v.rank, v.value)
                        from product_product_option_value ppov join product_option_value v on v.id = ppov.product_option_value_id
                       where ppov.product_product_option_id = ppo.id and ppov.deleted_at is null and v.deleted_at is null) as values
              from product_product_option ppo join product_option o on o.id = ppo.product_option_id
              where ppo.deleted_at is null and o.deleted_at is null order by ppo.product_id, o.id`),
  variant_option_values: q(`select vo.variant_id, vo.option_value_id, v.value, v.option_id
                            from product_variant_option vo join product_option_value v on v.id = vo.option_value_id
                            where v.deleted_at is null order by vo.variant_id`),
  prices: q(`select vps.variant_id, p.id as price_id, p.currency_code, p.amount, p.min_quantity, p.max_quantity,
                    (select json_agg(json_build_object('attribute', r.attribute, 'value', r.value, 'operator', r.operator))
                       from price_rule r where r.price_id = p.id and r.deleted_at is null) as rules
             from product_variant_price_set vps
             join price p on p.price_set_id = vps.price_set_id and p.deleted_at is null
             order by vps.variant_id, p.currency_code, p.id`),
  images: q(`select id, product_id, url, rank, metadata from image where deleted_at is null order by product_id, rank, id`),
  categories: q(`select id, name, handle, description, is_active, is_internal, rank, parent_category_id, metadata
                 from product_category where deleted_at is null order by rank, id`),
  category_products: q(`select product_category_id as category_id, product_id from product_category_product order by 1, 2`),
  collections: q(`select id, title, handle, metadata from product_collection where deleted_at is null order by id`),
  types: q(`select id, value, metadata from product_type where deleted_at is null order by id`),
  tags: q(`select id, value, metadata from product_tag where deleted_at is null order by id`),
  product_tags: q(`select product_id, product_tag_id as tag_id from product_tags order by 1, 2`),
  inventory: q(`select pvii.variant_id, ii.id as inventory_item_id, ii.sku,
                       (select json_agg(json_build_object('location_id', il.location_id, 'stocked', il.stocked_quantity, 'reserved', il.reserved_quantity))
                          from inventory_level il where il.inventory_item_id = ii.id and il.deleted_at is null) as levels
                from product_variant_inventory_item pvii join inventory_item ii on ii.id = pvii.inventory_item_id
                where ii.deleted_at is null order by pvii.variant_id`),
  regions: q(`select r.id, r.name, r.currency_code, r.metadata,
                     (select json_agg(c.iso_2 order by c.iso_2) from region_country c where c.region_id = r.id) as countries
              from region r where r.deleted_at is null order by r.name`),
  store_currencies: q(`select currency_code, is_default from store_currency order by currency_code`),
  site_locales: q(`select code, enabled, is_default from site_locale order by code`),
  product_translations: q(`select t.product_handle, t.locale, t.title, t.subtitle, t.description, t.short_characteristics, t.thumbnail, t.images,
                                  exists (select 1 from product p where p.handle = t.product_handle and p.deleted_at is null) as product_live
                           from product_translation t where t.deleted_at is null order by t.product_handle, t.locale`),
  ui_translations: q(`select resource, resource_key, field, locale, value from translation
                      where deleted_at is null and resource in ('ui', 'email') order by resource, resource_key, field, locale`),
  review_translations_count: q(`select locale, count(*)::int as n from translation where resource = 'review' and deleted_at is null group by locale order by locale`),
  home_banners: q(`select id, slot, template, layout, eyebrow, title, subtitle, cta_label, cta_href, image_url, image_focal_x, image_focal_y,
                          bg_class, bg_color, bg_image_url, bg_image_enabled, sort, active, valid_from, valid_to, metadata
                   from home_banner where deleted_at is null order by sort`),
  layout_configuration: q(`select * from layout_configuration`),
  articles: q(`select * from article order by locale, created_at`),
  shipping_options: q(`select id, name, provider_id, price_type, data, metadata, service_zone_id, shipping_profile_id
                       from shipping_option where deleted_at is null order by name`),
  pickup_point_records: q(`select * from pickup_point_record`),
  courses: q(`select * from course`),
};

writeFileSync(out, JSON.stringify(snapshot, null, 1) + "\n");
const counts = Object.fromEntries(Object.entries(snapshot).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
console.log(`${snapshot.exported_at} → ${out}`);
console.log(JSON.stringify(counts));
