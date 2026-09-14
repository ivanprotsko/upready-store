with ord as (
  select o.customer_id,
         count(*) as n_orders,
         string_agg(distinct upper(o.currency_code), '+') as currencies,
         sum(case when o.currency_code='rub' then (s.totals->>'accounting_total')::numeric else 0 end) as spent_rub,
         sum(case when o.currency_code='usd' then (s.totals->>'accounting_total')::numeric else 0 end) as spent_usd,
         min(o.created_at) as first_order,
         max(o.created_at) as last_order
  from "order" o
  join order_summary s on s.order_id=o.id and s.version=o.version and s.deleted_at is null
  where o.deleted_at is null and o.customer_id is not null
  group by 1),
last_addr as (
  select distinct on (o.customer_id) o.customer_id,
         nullif(concat_ws(', ', nullif(a.postal_code,''), nullif(a.country_code,''),
           nullif(a.province,''), nullif(a.city,''), nullif(a.address_1,''), nullif(a.address_2,'')), '') as address,
         a.phone as addr_phone
  from "order" o join order_address a on a.id=o.shipping_address_id
  where o.deleted_at is null
  order by o.customer_id, o.created_at desc)
select json_agg(row_to_json(t) order by t.name nulls last, t.email) from (
select
  nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '') as name,
  c.email,
  coalesce(nullif(c.phone,''), la.addr_phone) as phone,
  c.company_name,
  case when c.has_account then 'да' else 'нет' end as has_account,
  to_char(c.created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD HH24:MI') as registered_at,
  coalesce(od.n_orders, 0) as n_orders,
  coalesce(od.currencies, '') as currencies,
  coalesce(od.spent_rub, 0) as spent_rub,
  coalesce(od.spent_usd, 0) as spent_usd,
  to_char(od.first_order at time zone 'Asia/Makassar', 'YYYY-MM-DD') as first_order,
  to_char(od.last_order at time zone 'Asia/Makassar', 'YYYY-MM-DD') as last_order,
  la.address as last_address
from customer c
left join ord od on od.customer_id = c.id
left join last_addr la on la.customer_id = c.id
where c.deleted_at is null
) t;
