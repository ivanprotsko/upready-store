select json_agg(row_to_json(t) order by t.display_id, t.pos) from (
select o.display_id,
       row_number() over (partition by o.id order by li.created_at, li.id) as pos,
       coalesce(nullif(li.variant_sku,''), '') as sku,
       li.title,
       li.product_title,
       nullif(li.variant_title,'') as variant_title,
       oi.quantity,
       li.unit_price,
       (oi.quantity * li.unit_price) as line_total,
       upper(o.currency_code) as currency
from order_item oi
join order_line_item li on li.id = oi.item_id
join "order" o on o.id = oi.order_id
where oi.deleted_at is null and li.deleted_at is null and o.deleted_at is null
) t;
