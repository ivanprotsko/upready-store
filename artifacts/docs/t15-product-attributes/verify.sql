-- t15-product-attributes: the same numbers the facets route answers, computed
-- straight from the tables by hand.
--
-- The point is that neither side borrows the other's code: the route builds its
-- SQL in `api/store/tenant/product-attributes/facet-queries.ts`, this file is
-- written out plainly, and the PR quotes both.
--
--   psql -h 127.0.0.1 -p 5433 -U <user> -d upready_store_t15 \
--        -v shop="'ten_…'" -v perf="'ten_…'" \
--        -f artifacts/docs/t15-product-attributes/verify.sql

\set ON_ERROR_STOP on

\echo '--- 1. магазин t15shop: товары с объёмом от 100 до 500 включительно'
select p.title, v.value_number as obem
from tenant_product_attribute_value v
join tenant_product_attribute a on a.id = v.attribute_id and a.key = 'obem'
join tenant_tenant_product_product link
  on link.product_id = v.product_id and link.tenant_id = v.tenant_id
join product p on p.id = v.product_id and p.status = 'published' and p.deleted_at is null
where v.tenant_id = :shop
  and v.deleted_at is null
  and v.value_number >= 100::real
  and v.value_number <= 500::real
order by v.value_number;

\echo '--- 2. магазин t15shop: сколько их'
select count(distinct v.product_id) as products_in_range
from tenant_product_attribute_value v
join tenant_product_attribute a on a.id = v.attribute_id and a.key = 'obem'
join product p on p.id = v.product_id and p.status = 'published' and p.deleted_at is null
where v.tenant_id = :shop
  and v.deleted_at is null
  and v.value_number between 100::real and 500::real;

\echo '--- 3. нагрузочный магазин t15perf: тот же диапазон'
select count(distinct v.product_id) as products_in_range
from tenant_product_attribute_value v
join tenant_product_attribute a on a.id = v.attribute_id and a.key = 'obem'
join product p on p.id = v.product_id and p.status = 'published' and p.deleted_at is null
where v.tenant_id = :perf
  and v.deleted_at is null
  and v.value_number between 100::real and 500::real;

\echo '--- 4. нагрузочный магазин: диапазон И состав travy'
select count(distinct o.product_id) as products
from tenant_product_attribute_value o
join tenant_product_attribute ao on ao.id = o.attribute_id and ao.key = 'obem'
join tenant_product_attribute_value s on s.product_id = o.product_id
join tenant_product_attribute asx on asx.id = s.attribute_id and asx.key = 'sostav'
join product p on p.id = o.product_id and p.status = 'published' and p.deleted_at is null
where o.tenant_id = :perf
  and o.deleted_at is null
  and s.deleted_at is null
  and o.value_number between 100::real and 500::real
  and s.value_text = 'travy';

\echo '--- 5. нагрузочный магазин: раскладка «состава» по всему каталогу'
select v.value_text, count(distinct v.product_id) as products
from tenant_product_attribute_value v
join tenant_product_attribute a on a.id = v.attribute_id and a.key = 'sostav'
join product p on p.id = v.product_id and p.status = 'published' and p.deleted_at is null
where v.tenant_id = :perf and v.deleted_at is null
group by v.value_text
order by v.value_text;

\echo '--- 6. изоляция: характеристики по магазинам'
select t.handle, count(a.id) as attributes
from tenant t
left join tenant_product_attribute a on a.tenant_id = t.id and a.deleted_at is null
where t.handle in ('t15shop', 't15other', 't15perf')
group by t.handle
order by t.handle;
