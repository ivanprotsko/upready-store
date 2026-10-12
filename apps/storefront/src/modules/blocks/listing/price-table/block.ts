import type { BlockEntry } from "../../types"

import PriceTable from "."
import { LABELS, UNIT, parsePriceTableProps, type PriceTableProps } from "./props"

/** The registry entry of `listing/price-table`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const priceTable: BlockEntry<PriceTableProps> = {
  id: "listing/price-table",
  category: "listing",
  variant: "price-table",
  title: "Price table",
  roles: ["section-header", "table", "table-row", "price", "stock-badge", "quantity-input", "cta-primary"],
  data: ["products", "categories"],
  status: "lab",
  placement: "home",
  component: PriceTable,
  parseProps: parsePriceTableProps,
  fixtures: {
    // A category no shop has: the source holds no product, and the section is not drawn.
    empty: {
      header: null,
      source: { category: "empty-selection" },
      limit: 20,
      columns: ["sku", "stock"],
      unit: UNIT,
      note: {},
      labels: LABELS,
    },
    // The playground's shop, globex: its whole catalogue from A to Z, every optional column.
    sample: {
      header: {
        eyebrow: { ru: "Для оптовых покупателей", en: "For trade buyers" },
        heading: {},
        description: {},
        seeAll: null,
      },
      source: { sort: "title" },
      limit: 20,
      columns: ["sku", "stock", "unit"],
      unit: UNIT,
      note: {
        ru: "Минимальный заказ — одна коробка. Отгружаем в день оплаты.",
        en: "The minimum order is one box. We ship the day you pay.",
      },
      labels: LABELS,
    },
  },
}
