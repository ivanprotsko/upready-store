-- t15-product-attributes: the catalogue the facet measurement runs against.
--
-- 3 000 published products owned by the tenant `t15perf`, each carrying three
-- characteristics: a choice out of four, a volume between 10 and 1 000, and a
-- yes/no. That is 9 000 value rows, which is what the facet aggregates scan.
--
-- WHAT THIS IS NOT. These products have no variants, no prices and no images:
-- the facet queries join `tenant_tenant_product_product`, `product` (for
-- `status`) and `tenant_product_attribute_value`, and nothing else, so the
-- columns a storefront listing needs would not change a single row of what is
-- being measured. The measurement is of the facet query, and the shape of the
-- data it reads is real.
--
--   psql -h 127.0.0.1 -p 5433 -U <user> -d upready_store_t15 \
--        -v tenant="'ten_…'" -v sostav="'tpat_…'" -v obem="'tpat_…'" \
--        -v flag="'tpat_…'" -f artifacts/docs/t15-product-attributes/seed-perf.sql

\set ON_ERROR_STOP on

begin;

insert into product (id, title, handle, status, created_at, updated_at)
select
  'prod_t15perf_' || lpad(n::text, 5, '0'),
  'Perf product ' || n,
  'perf-product-' || n,
  'published',
  now(),
  now()
from generate_series(1, 3000) as n
on conflict (id) do nothing;

insert into tenant_tenant_product_product (id, tenant_id, product_id, created_at, updated_at)
select
  'tlink_t15perf_' || lpad(n::text, 5, '0'),
  :tenant,
  'prod_t15perf_' || lpad(n::text, 5, '0'),
  now(),
  now()
from generate_series(1, 3000) as n
-- The link's primary key is `(tenant_id, product_id)`, not `id`.
on conflict (tenant_id, product_id) do nothing;

-- A choice out of four, spread evenly.
insert into tenant_product_attribute_value
  (id, tenant_id, product_id, attribute_id, value_text, created_at, updated_at)
select
  'tpav_t15perf_s_' || lpad(n::text, 5, '0'),
  :tenant,
  'prod_t15perf_' || lpad(n::text, 5, '0'),
  :sostav,
  (array['travy', 'magniy', 'vitaminy', 'kollagen'])[1 + (n % 4)],
  now(),
  now()
from generate_series(1, 3000) as n
on conflict (id) do nothing;

-- A volume from 10 to 1 000, so a range filter has something to cut.
insert into tenant_product_attribute_value
  (id, tenant_id, product_id, attribute_id, value_number, created_at, updated_at)
select
  'tpav_t15perf_o_' || lpad(n::text, 5, '0'),
  :tenant,
  'prod_t15perf_' || lpad(n::text, 5, '0'),
  :obem,
  10 + (n % 991),
  now(),
  now()
from generate_series(1, 3000) as n
on conflict (id) do nothing;

insert into tenant_product_attribute_value
  (id, tenant_id, product_id, attribute_id, value_boolean, created_at, updated_at)
select
  'tpav_t15perf_g_' || lpad(n::text, 5, '0'),
  :tenant,
  'prod_t15perf_' || lpad(n::text, 5, '0'),
  :flag,
  (n % 3) = 0,
  now(),
  now()
from generate_series(1, 3000) as n
on conflict (id) do nothing;

commit;

select
  (select count(*) from tenant_tenant_product_product where tenant_id = :tenant) as products,
  (select count(*) from tenant_product_attribute_value where tenant_id = :tenant) as values;
