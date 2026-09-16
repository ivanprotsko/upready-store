import { Badge, Button, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

import type { CatalogRow, CatalogState } from "../../../../hooks/api/marketplace-catalog"
import { useUnlinkMarketplaceCard } from "../../../../hooks/api/marketplace-catalog"
import { CatalogDiffCell } from "./catalog-diff"
import { CatalogLinkDialog } from "./catalog-link-dialog"

/**
 * One row per ARTICLE, one line per card of that article
 * (w14-mp-catalog-link).
 *
 * A plain table rather than the data-table component: the article cell spans
 * the card lines (`rowSpan`), so the same goods on WB and on Ozon read as one
 * thing with two listings, which is the whole point of a single catalog.
 */

const STATE_LABEL: Record<CatalogState, string> = {
  linked: "связано",
  needs_choice: "требует выбора",
  not_found_in_shop: "не найдено в магазине",
  missing_on_marketplace: "нет на площадке",
}

const STATE_COLOR: Record<CatalogState, "green" | "orange" | "red" | "grey"> = {
  linked: "green",
  needs_choice: "orange",
  not_found_in_shop: "red",
  missing_on_marketplace: "grey",
}

const REASON_HINT = {
  ambiguous: "артикул несут несколько товаров магазина — выбор за вами",
  not_linked_yet: "совпадение одно, связь ещё не записана — нажмите «Связать»",
} as const

const NOT_SET = "—"

const HEAD = [
  "Артикул",
  "Товар магазина",
  "Карточка площадки",
  "Цена, магазин / площадка",
  "Остаток, магазин / площадка",
  "Фото, магазин / площадка",
  "",
]

const UnlinkButton = ({ id }: { id: string }) => {
  const { mutate, isPending } = useUnlinkMarketplaceCard()

  return (
    <Button size="small" variant="transparent" disabled={isPending} onClick={() => mutate(id)}>
      Отвязать
    </Button>
  )
}

export const CatalogTable = ({ rows }: { rows: CatalogRow[] }) => {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-6">
        <Text size="small" className="text-ui-fg-subtle">
          В этой вкладке артикулов нет.
        </Text>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left">
        <thead className="border-ui-border-base border-b">
          <tr>
            {HEAD.map((title) => (
              <th key={title} className="text-ui-fg-subtle txt-compact-xsmall-plus px-6 py-2">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const lines = row.cards.length ? row.cards : [null]

            return lines.map((card, index) => {
              const differences = card
                ? row.differences.filter(
                    (difference, position) =>
                      Math.floor(position / 3) === index && difference !== undefined
                  )
                : []
              const price = differences.find((difference) => difference.metric === "price")
              const stock = differences.find((difference) => difference.metric === "stock")
              const photos = differences.find((difference) => difference.metric === "photos")

              return (
                <tr
                  key={`${row.vendor_code}-${card?.marketplace ?? "shop"}-${card?.external_id ?? index}`}
                  className="border-ui-border-base border-b last:border-b-0"
                >
                  {index === 0 ? (
                    <td className="px-6 py-3 align-top" rowSpan={lines.length}>
                      <div className="flex flex-col gap-y-1">
                        <Text size="small" weight="plus">
                          {row.vendor_code}
                        </Text>
                        <div>
                          <Badge size="2xsmall" color={STATE_COLOR[row.state]}>
                            {STATE_LABEL[row.state]}
                          </Badge>
                        </div>
                        {row.reason ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {REASON_HINT[row.reason]}
                          </Text>
                        ) : null}
                      </div>
                    </td>
                  ) : null}

                  {index === 0 ? (
                    <td className="px-6 py-3 align-top" rowSpan={lines.length}>
                      {row.shop ? (
                        <div className="flex flex-col gap-y-0.5">
                          <Link
                            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small"
                            to={`/products/${row.shop.product_id}`}
                          >
                            {row.shop.product_title ?? row.shop.product_id}
                          </Link>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            SKU {row.shop.sku ?? NOT_SET}
                          </Text>
                        </div>
                      ) : row.candidates.length > 1 ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          {row.candidates.length} кандидата
                        </Text>
                      ) : (
                        <Text size="small" className="text-ui-fg-muted">
                          {NOT_SET}
                        </Text>
                      )}
                    </td>
                  ) : null}

                  <td className="px-6 py-3 align-top">
                    {card ? (
                      <div className="flex flex-col gap-y-0.5">
                        <div className="flex items-center gap-x-2">
                          <Badge size="2xsmall">{card.marketplace.toUpperCase()}</Badge>
                          <Text size="small">{card.title ?? NOT_SET}</Text>
                        </div>
                        <Text size="xsmall" className="text-ui-fg-subtle tabular-nums">
                          id {card.external_id} · строк цен и остатков: {card.offers}
                        </Text>
                        {card.link ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            связь: {card.link.matched_by === "manual" ? "вручную" : "по артикулу"}
                          </Text>
                        ) : null}
                      </div>
                    ) : (
                      <Text size="small" className="text-ui-fg-muted">
                        карточки нет
                      </Text>
                    )}
                  </td>

                  <td className="px-6 py-3 align-top">
                    {price ? <CatalogDiffCell difference={price} /> : <span>{NOT_SET}</span>}
                  </td>
                  <td className="px-6 py-3 align-top">
                    {stock ? <CatalogDiffCell difference={stock} /> : <span>{NOT_SET}</span>}
                  </td>
                  <td className="px-6 py-3 align-top">
                    {photos ? <CatalogDiffCell difference={photos} /> : <span>{NOT_SET}</span>}
                  </td>

                  <td className="px-6 py-3 align-top">
                    {card?.link ? (
                      <UnlinkButton id={card.link.id} />
                    ) : card ? (
                      <CatalogLinkDialog
                        row={row}
                        marketplace={card.marketplace}
                        externalId={card.external_id}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  )
}
