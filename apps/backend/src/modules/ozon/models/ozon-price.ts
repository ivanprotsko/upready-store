import { model } from "@medusajs/framework/utils";

/**
 * The price, commissions and price indexes of one Ozon card, mirrored from
 * `POST /v5/product/info/prices` (w11-ozon-readonly-client).
 *
 * Read-only mirror. Changing a price on Ozon is `POST /v1/product/import/prices`
 * ("Обновить цену"), which stands in `OZON_WRITE_PATHS`.
 *
 * Amounts arrive as strings or numbers depending on the field and are kept as
 * `bigNumber` where they are money, with `price.currency_code` beside them.
 * `commissions`, `price_indexes` and `marketing_actions` are kept as Ozon
 * returns them: they are nested objects that the panel reads whole, and a
 * column per field would be a migration per Ozon release.
 */
const OzonPrice = model
  .define("ozon_price", {
    id: model.id({ prefix: "ozprice" }).primaryKey(),
    tenant_id: model.text(),
    product_id: model.text(),
    offer_id: model.text().nullable(),
    /** `price.price`: what the customer pays now. */
    price: model.bigNumber().nullable(),
    /** `price.old_price`: the struck-through price. */
    old_price: model.bigNumber().nullable(),
    /** `price.min_price`: the floor the seller set. */
    min_price: model.bigNumber().nullable(),
    currency_code: model.text().nullable(),
    /** `price.vat`, Ozon's own fraction (0.2 for 20 %). */
    vat: model.text().nullable(),
    /** `commissions` verbatim: FBO/FBS percentages and the delivery and return amounts. */
    commissions: model.json().nullable(),
    /** `price_indexes` verbatim: Ozon's colour index and the three comparison baskets. */
    price_indexes: model.json().nullable(),
    /** `marketing_actions` verbatim: which Ozon promotions this card is in. */
    marketing_actions: model.json().nullable(),
    source: model.text().default("ozon"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonPrice;
