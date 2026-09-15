import { model } from "@medusajs/framework/utils";

/**
 * Inventory of one Ozon SKU under one fulfilment scheme, mirrored from
 * `POST /v4/product/info/stocks` (w11-ozon-readonly-client).
 *
 * Ozon's own description of that method: "Возвращает информацию о количестве
 * товаров по схемам FBO, FBS, rFBS и FBP: сколько единиц есть в наличии,
 * сколько зарезервировано покупателями." So one card yields several rows, one
 * per (sku, type, shipment_type) — the saved example answers for the same sku
 * twice, `type: "fbs"` and `type: "fbo"`.
 *
 * Never written back: overwriting inventory on Ozon is
 * `POST /v2/products/stocks` ("Обновить количество товаров на складах"), which
 * stands in `OZON_WRITE_PATHS`. That method is the one this whole task exists
 * to keep out of reach, because a wrong stock number on a marketplace is a
 * fine, not a typo.
 *
 * `shipment_type` is part of the identity and defaults to the empty string
 * rather than NULL: a partial unique index treats two NULLs as distinct, so a
 * nullable key column would silently allow duplicate rows.
 */
const OzonStock = model
  .define("ozon_stock", {
    id: model.id({ prefix: "ozstock" }).primaryKey(),
    tenant_id: model.text(),
    product_id: model.text(),
    offer_id: model.text().nullable(),
    /** Ozon's id of the item on the site. */
    sku: model.text(),
    /** `stocks[].type`: fbo, fbs, rfbs or fbp. */
    stock_type: model.text(),
    /** `stocks[].shipment_type`, e.g. SHIPMENT_TYPE_GENERAL. Part of the identity. */
    shipment_type: model.text().default(""),
    /** `present`: units in stock. */
    present: model.number().default(0),
    /** `reserved`: units customers have already claimed. */
    reserved: model.number().default(0),
    source: model.text().default("ozon"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "sku", "stock_type", "shipment_type"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonStock;
