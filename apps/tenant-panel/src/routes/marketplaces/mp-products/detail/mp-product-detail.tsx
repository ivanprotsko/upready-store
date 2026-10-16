import { ArrowUpRightOnBox, Link as LinkIcon, XMarkMini } from "@medusajs/icons"
import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams, useSearchParams } from "react-router-dom"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { SectionRow } from "../../../../components/common/section"
import { SingleColumnPageSkeleton } from "../../../../components/common/skeleton"
import { DataTableRoot } from "../../../../components/table/data-table/data-table-root"
import { useDataTable } from "../../../../hooks/use-data-table"
import { useDate } from "../../../../hooks/use-date"
import {
  MARKETPLACE_LABEL,
  useMpProduct,
  type MarketplaceId,
  type MpLinkState,
  type MpOfferLine,
  type MpProductDetail as MpProductDetailData,
} from "../../../../hooks/api/marketplace-section"
import { DateTimeCell, MoneyCell, UnitsCell } from "../../common/mp-cells"
import { useRouteMarketplace } from "../../common/use-route-marketplace"
import { MpLinkDrawer } from "../components/mp-link-drawer"
import { MpProductActions } from "../components/mp-product-actions"
import { useMpLinkActions } from "../use-link-actions"

/**
 * The card page of «Wildberries → Товары» (task-02 of mp-section-design):
 * `/marketplaces/wildberries/products/:id`, opened by a click on a row or by
 * «Открыть карточку» in its menu.
 *
 * Laid out like the shop's product page: one `SingleColumnPage`, one
 * `Container` per section with a heading row on top. The card as the import
 * stored it, its link to the shop, the price and stock lines (size ×
 * warehouse), the photos and the characteristics. Read only toward the
 * marketplace, like the list: the one write here is the link to the shop,
 * which goes to `mp_link` in our database.
 *
 * A card of another shop answers 404, and the route's `ErrorBoundary` shows
 * «не найдено» exactly as for a card that does not exist.
 */
export const MpProductDetail = ({ marketplace: forced }: { marketplace?: MarketplaceId }) => {
  const fromRoute = useRouteMarketplace()
  const marketplace = forced ?? fromRoute
  const { id } = useParams()
  const { product, isLoading, isError, error } = useMpProduct(marketplace, id!)
  const [linking, setLinking] = useState(false)

  if (isError) {
    throw error
  }

  if (isLoading || !product) {
    return <SingleColumnPageSkeleton sections={4} />
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <GeneralSection product={product} marketplace={marketplace} onLink={() => setLinking(true)} />
      <LinkSection product={product} onLink={() => setLinking(true)} />
      <OffersSection product={product} />
      <PhotosSection product={product} />
      <AttributesSection product={product} />
      {linking ? <MpLinkDrawer product={product} onClose={() => setLinking(false)} /> : null}
    </SingleColumnPage>
  )
}

type SectionProps = { product: MpProductDetailData }

const GeneralSection = ({
  product,
  marketplace,
  onLink,
}: SectionProps & { marketplace: MarketplaceId; onLink: () => void }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const label = MARKETPLACE_LABEL[marketplace]
  const amount = product.discount_price ?? product.price

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading>{product.title ?? product.external_id}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("mp.products.detail.subtitle", {
              vendorCode: product.vendor_code ?? "—",
              marketplace: label,
              externalId: product.external_id,
            })}
          </Text>
        </div>
        <div className="flex items-center gap-x-2 max-md:w-full">
          {product.url ? (
            <Button size="small" variant="secondary" className="max-md:min-h-11 max-md:flex-1" asChild>
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                <ArrowUpRightOnBox />
                {t("mp.products.actions.openOnMarketplace", { marketplace: label })}
              </a>
            </Button>
          ) : null}
          <MpProductActions row={product} marketplace={marketplace} onLink={onLink} withOpenCard={false} />
        </div>
      </div>
      <SectionRow title={t("mp.fields.vendorCode")} value={product.vendor_code} />
      <SectionRow
        title={t("mp.products.detail.externalId", { marketplace: label })}
        value={product.external_id}
      />
      <SectionRow title={t("mp.fields.brand")} value={product.brand} />
      <SectionRow title={t("fields.category")} value={product.category_name} />
      <SectionRow
        title={t("fields.price")}
        value={
          amount === null ? null : (
            <div className="txt-compact-small">
              <MoneyCell
                amount={amount}
                strike={product.discount_price ? product.price : null}
                currency={product.currency}
              />
            </div>
          )
        }
      />
      <SectionRow
        title={t("mp.fields.stock")}
        value={
          product.stock === null ? (
            t("mp.products.detail.stockUnknown")
          ) : (
            <div className="txt-compact-small">
              <UnitsCell value={product.stock} unit={t("mp.units.pcs")} />
            </div>
          )
        }
      />
      <SectionRow title={t("mp.fields.syncedAt")} value={getFullDate({ date: product.synced_at, includeTime: true })} />
      <SectionRow
        title={t("mp.products.detail.mpUpdatedAt", { marketplace: label })}
        value={product.mp_updated_at ? getFullDate({ date: product.mp_updated_at, includeTime: true }) : null}
      />
    </Container>
  )
}

const LINK_COLOR: Record<MpLinkState, "green" | "orange" | "grey"> = {
  linked: "green",
  needs_choice: "orange",
  not_found: "grey",
}

const LinkSection = ({ product, onLink }: SectionProps & { onLink: () => void }) => {
  const { t } = useTranslation()
  const { unlinkCard, isUnlinking } = useMpLinkActions()
  const { link } = product
  const vendorCode = product.vendor_code ?? "—"

  const hint =
    link.state === "linked"
      ? link.matched_by === "manual"
        ? t("mp.products.detail.linkedManualHint")
        : t("mp.products.detail.linkedAutoHint", { vendorCode })
      : link.state === "needs_choice"
        ? t("mp.products.detail.needsChoiceHint", { vendorCode, count: link.candidates })
        : t("mp.products.detail.notFoundHint", { vendorCode })

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h2">{t("mp.fields.link")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {hint}
          </Text>
        </div>
        {link.state === "linked" ? (
          <Button
            size="small"
            variant="secondary"
            className="max-md:min-h-11 max-md:w-full"
            isLoading={isUnlinking}
            onClick={() => unlinkCard(product)}
          >
            <XMarkMini />
            {t("mp.products.actions.unlink")}
          </Button>
        ) : (
          <Button size="small" variant="secondary" className="max-md:min-h-11 max-md:w-full" onClick={onLink}>
            <LinkIcon />
            {link.state === "needs_choice" ? t("mp.products.actions.choose") : t("mp.products.actions.link")}
          </Button>
        )}
      </div>
      <SectionRow
        title={t("mp.products.detail.linkState")}
        value={<StatusBadge color={LINK_COLOR[link.state]}>{t(`mp.linkState.${link.state}`)}</StatusBadge>}
      />
      <SectionRow
        title={t("mp.products.detail.shopProduct")}
        value={
          link.product_id ? (
            <Link to={`/products/${link.product_id}`} className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
              {link.product_title ?? link.product_id}
            </Link>
          ) : null
        }
      />
      {link.state === "linked" ? (
        <SectionRow
          title={t("mp.products.detail.matchedBy")}
          value={link.matched_by ? t(`mp.products.detail.matchedByValue.${link.matched_by}`) : null}
        />
      ) : null}
      <SectionRow title={t("mp.products.detail.candidates")} value={String(link.candidates)} />
    </Container>
  )
}

const LINES_PAGE_SIZE = 20
const LINES_PREFIX = "lines"

const lineHelper = createColumnHelper<MpOfferLine>()

const OffersSection = ({ product }: SectionProps) => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const offset = Number(searchParams.get(`${LINES_PREFIX}_offset`) ?? 0) || 0
  const lines = product.offers

  const columns = useMemo(
    () => [
      lineHelper.accessor("size", {
        header: () => <span>{t("mp.products.detail.size")}</span>,
        cell: ({ getValue }) => <span className="truncate">{getValue() ?? t("mp.products.detail.oneSize")}</span>,
        meta: { phoneTop: true },
      }),
      lineHelper.accessor("warehouse", {
        header: () => <span>{t("mp.fields.warehouse")}</span>,
        cell: ({ getValue }) => (
          <span className="truncate">{getValue() ?? t("mp.products.detail.noWarehouse")}</span>
        ),
      }),
      lineHelper.display({
        id: "price",
        header: () => <span>{t("fields.price")}</span>,
        cell: ({ row }) => (
          <MoneyCell
            amount={row.original.discount_price ?? row.original.price}
            strike={row.original.discount_price ? row.original.price : null}
            currency={product.currency}
          />
        ),
        meta: { phoneTop: "end" },
      }),
      lineHelper.accessor("stock", {
        header: () => <span>{t("mp.fields.stock")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} unit={t("mp.units.pcs")} />,
      }),
      lineHelper.accessor("measured_at", {
        header: () => <span>{t("mp.products.detail.measuredAt")}</span>,
        cell: ({ getValue }) => <DateTimeCell date={getValue()} />,
      }),
    ],
    [t, product.currency]
  )

  const { table } = useDataTable({
    data: lines.slice(offset, offset + LINES_PAGE_SIZE),
    columns,
    count: lines.length,
    enablePagination: true,
    pageSize: LINES_PAGE_SIZE,
    prefix: LINES_PREFIX,
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">{t("mp.products.detail.offersTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("mp.products.detail.offersSubtitle", { count: lines.length })}
        </Text>
      </div>
      {lines.length ? (
        // The table and its pager without `_DataTable`'s search and filter
        // row: there is nothing to search in one card's lines, and the empty
        // row drew a blank strip above the header.
        <DataTableRoot table={table} columns={columns} count={lines.length} pagination />
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("mp.products.detail.noOffers")}
          </Text>
        </div>
      )}
    </Container>
  )
}

const PhotosSection = ({ product }: SectionProps) => {
  const { t } = useTranslation()

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("mp.products.detail.photosTitle")}</Heading>
      </div>
      {product.photos.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-4 px-6 py-4">
          {product.photos.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shadow-elevation-card-rest hover:shadow-elevation-card-hover transition-fg relative aspect-square size-full overflow-hidden rounded-[8px]"
            >
              <img
                src={url}
                alt={t("mp.products.detail.photoAlt", { index: index + 1 })}
                loading="lazy"
                className="size-full object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("mp.products.detail.noPhotos")}
          </Text>
        </div>
      )}
    </Container>
  )
}

/** The fixed keys of `attributes`; any other key is the marketplace's own characteristic name. */
const KNOWN_ATTRIBUTES = [
  "sizes",
  "dimensions_length",
  "dimensions_width",
  "dimensions_height",
  "dimensions_weight",
  "imt_id",
  "subject_id",
] as const

const AttributesSection = ({ product }: SectionProps) => {
  const { t } = useTranslation()
  const entries = Object.entries(product.attributes)
  const own = entries.filter(([key]) => !(KNOWN_ATTRIBUTES as readonly string[]).includes(key))
  const known = KNOWN_ATTRIBUTES.filter((key) => product.attributes[key] !== undefined)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("mp.products.detail.attributesTitle")}</Heading>
      </div>
      {entries.length ? (
        <>
          {own.map(([name, value]) => (
            <SectionRow key={name} title={name} value={value} />
          ))}
          {known.map((key) => (
            <SectionRow key={key} title={t(`mp.products.detail.attr.${key}`)} value={product.attributes[key]} />
          ))}
        </>
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("mp.products.detail.noAttributes")}
          </Text>
        </div>
      )}
    </Container>
  )
}

