with items as (
  select oi.order_id,
         sum(oi.quantity * li.unit_price) as subtotal,
         sum(oi.quantity) as qty,
         string_agg(
           coalesce(nullif(li.variant_sku,''), '(без SKU)')
           || ' — ' || li.title
           || ' × ' || trim(to_char(oi.quantity,'FM999999990.##'))
           || ' × ' || trim(to_char(li.unit_price,'FM999999990.00')),
           ' | ' order by li.created_at, li.id) as items_text
  from order_item oi
  join order_line_item li on li.id = oi.item_id
  where oi.deleted_at is null and li.deleted_at is null
  group by 1),
ship as (
  select os.order_id,
         sum(sm.amount) as shipping,
         string_agg(distinct sm.name, ' | ') as ship_name
  from order_shipping os
  join order_shipping_method sm on sm.id = os.shipping_method_id
  where os.deleted_at is null and sm.deleted_at is null
  group by 1),
ful as (
  select ofx.order_id,
         bool_or(f.shipped_at is not null) as shipped,
         bool_or(f.delivered_at is not null) as delivered,
         bool_or(f.packed_at is not null) as packed
  from order_fulfillment ofx
  join fulfillment f on f.id = ofx.fulfillment_id
  where ofx.deleted_at is null and f.deleted_at is null
  group by 1)
select json_agg(row_to_json(t) order by t.display_id) from (
select
  o.display_id,
  to_char(o.created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD HH24:MI') as created_at,
  case o.status when 'pending' then 'в работе' when 'completed' then 'завершён'
       when 'canceled' then 'отменён' when 'draft' then 'черновик'
       when 'archived' then 'в архиве' when 'requires_action' then 'требует действия'
       else o.status::text end as status,
  case
    when (s.totals->>'refunded_total')::numeric > 0
         and (s.totals->>'refunded_total')::numeric >= (s.totals->>'paid_total')::numeric then 'возврат'
    when (s.totals->>'refunded_total')::numeric > 0 then 'частичный возврат'
    when (s.totals->>'accounting_total')::numeric = 0 then 'нечего оплачивать'
    when (s.totals->>'paid_total')::numeric = 0 then 'не оплачен'
    when (s.totals->>'paid_total')::numeric >= (s.totals->>'accounting_total')::numeric then 'оплачен'
    else 'оплачен частично' end as payment_status,
  case
    when fu.delivered then 'доставлен'
    when fu.shipped then 'отправлен'
    when fu.packed then 'собран'
    else 'не отгружен' end as fulfillment_status,
  nullif(trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), '') as customer_name,
  o.email,
  a.phone,
  nullif(concat_ws(', ',
    nullif(a.postal_code,''), nullif(a.country_code,''), nullif(a.province,''),
    nullif(a.city,''), nullif(a.address_1,''), nullif(a.address_2,'')), '') as address,
  sh.ship_name as shipping_method,
  upper(o.currency_code) as currency,
  coalesce(i.subtotal, 0) as subtotal,
  coalesce(sh.shipping, 0) as shipping,
  coalesce((s.totals->>'discount_total')::numeric, 0)
    + coalesce((select sum(adj.amount) from order_line_item_adjustment adj
                join order_item oi2 on oi2.item_id = adj.item_id and oi2.deleted_at is null
                where oi2.order_id = o.id and adj.deleted_at is null), 0) as discount,
  (s.totals->>'accounting_total')::numeric as total,
  (s.totals->>'paid_total')::numeric as paid,
  coalesce(i.qty, 0) as items_qty,
  coalesce(i.items_text, '') as items,
  case
    when split_part(o.email,'@',2) ~* '(\.local$|\.test$|^test\.|\.invalid$|^example\.|^upready\.dev$|^ivanprotsko\.com$|^smoke\.)'
      then 'служебный (внутренний домен)'
    when o.email ~* '^(test|demo|selfheal|p[0-9]+-)'
      then 'служебный (тестовый ящик магазина)'
    else '' end as record_kind
from "order" o
join order_summary s on s.order_id = o.id and s.version = o.version and s.deleted_at is null
left join order_address a on a.id = o.shipping_address_id
left join items i on i.order_id = o.id
left join ship sh on sh.order_id = o.id
left join ful fu on fu.order_id = o.id
where o.deleted_at is null
) t;
