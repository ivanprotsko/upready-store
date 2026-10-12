import { clx } from "@medusajs/ui"
import { Plus } from "lucide-react"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import ProductMedia from "@modules/products/components/product-media"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import AddBundleButton, { type BundleLine } from "./add-bundle-button"
import type { BundleProps } from "./props"
import { readBundle, type BundleItem } from "./selection"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/** The primary button of the template's button layer, full width of the summary card. */
const BUTTON_CLASS = clx(
  "inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  focusRing
)

/** What `draftLineFor` needs of a product the button adds, and nothing more in the page's payload. */
const lineOf = ({ product, variant }: BundleItem): BundleLine | null =>
  variant
    ? {
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          thumbnail: product.thumbnail,
          metadata: product.metadata,
          images: product.images?.slice(0, 1).map((image) => ({ url: image.url })) ?? null,
        },
        variant: {
          id: variant.id,
          title: variant.title,
          calculated_price: variant.calculated_price,
          manage_inventory: variant.manage_inventory,
          allow_backorder: variant.allow_backorder,
          inventory_quantity: variant.inventory_quantity,
        },
      }
    : null

/**
 * `collection/bundle` (t-2026-10-12-33 wave 2): products sold together as a set, the 16.09 lab's
 * `bundle` and InSales' «Комплект». 2–4 of the shop's products as compact cards with a plus between
 * them, then a card with the set's name, the sum of the cards' prices and one button.
 *
 * - The cards carry the storefront card's markers (`ProductMedia`, `product-wrapper`, `product-title`,
 *   `price`), so a page measures them as product cards. Below 720 px each is a row, the picture 80 px
 *   wide, the plus under it; from 720 px they stand side by side, the plus between the pictures; from
 *   1024 px the summary stands beside them.
 * - The type is 16 px with a 20 px set name and a 24 px sum, every pair ≥ 1.15× apart (QR-TYPE-SCALE):
 *   `ProductCard`'s 14 px title beside its 16 px price is closer than that, so the card keeps its
 *   markers and not its sizes; the title differs from the price in weight (QR-PRICE).
 * - «Добавить набор» adds the one variant of each product through the cart queue
 *   (`add-bundle-button.tsx`). A product with several variants is not added: its card links to its
 *   page with «Выбрать вариант», and a line under the button says so.
 * - A product out of stock turns the button off, and the line under it names the product.
 * - The sum is the cards' prices added up. No discount is computed or promised: the shop has no such
 *   promotion to back it.
 *
 * With fewer than two of the products found and priced in the shop's region it draws nothing.
 */
export default async function Bundle({
  header,
  title,
  note,
  products,
  totalLabel,
  buttonLabel,
  chooseLabel,
  outOfStockLabel,
  chooseHint,
}: BundleProps) {
  const locale = await getLocale()
  const bundle = await readBundle(products, locale)

  if (!bundle) {
    return null
  }

  const name = pickText(title, locale)
  const line = pickText(note, locale)
  const choose = pickText(chooseLabel, locale)
  const lines = bundle.addable.map(lineOf).filter((entry): entry is BundleLine => entry !== null)
  const reasonId = `bundle-reason-${products.join("-")}`
  const reason = bundle.outOfStock.length
    ? `${pickText(outOfStockLabel, locale) ?? ""}: ${bundle.outOfStock.join(", ")}`
    : bundle.needsChoice && lines.length
      ? pickText(chooseHint, locale)
      : null

  return (
    <BlockSection block="collection/bundle" locale={locale} header={header}>
      <div className="grid grid-cols-1 gap-8 small:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] small:items-center small:gap-12">
        <ul className="flex flex-col gap-8 min-[720px]:flex-row min-[720px]:items-start">
          {bundle.items.map((item, index) => {
            const href = `/products/${item.product.handle}`
            const productTitle = item.product.title ?? ""
            return (
              <li key={item.product.id} className="relative min-w-0 min-[720px]:static min-[720px]:max-w-48 min-[720px]:flex-1">
                <Link
                  href={href}
                  data-testid="product-wrapper"
                  data-role="product-card"
                  className={clx(
                    "group flex flex-row items-center gap-4 rounded-[var(--radius)] min-[720px]:flex-col min-[720px]:items-stretch min-[720px]:gap-3",
                    focusRing
                  )}
                >
                  <div className="w-20 shrink-0 min-[720px]:relative min-[720px]:w-full">
                    <ProductMedia
                      src={item.product.thumbnail || item.product.images?.[0]?.url || null}
                      alt={productTitle}
                      sizes="(min-width: 720px) 192px, 80px"
                    />
                    {index < bundle.items.length - 1 ? (
                      <span
                        aria-hidden
                        className="absolute -bottom-6 start-8 flex size-4 items-center justify-center text-ui-fg-muted min-[720px]:-end-6 min-[720px]:bottom-auto min-[720px]:start-auto min-[720px]:top-1/2 min-[720px]:-mt-2"
                      >
                        <Plus className="size-4" strokeWidth={2} />
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p
                      data-testid="product-title"
                      className="line-clamp-2 break-words text-base font-medium leading-6 text-ui-fg-base group-hover:underline group-hover:underline-offset-2"
                    >
                      {productTitle}
                    </p>
                    <p className="tabular-nums">
                      <span
                        data-testid="price"
                        data-role="price"
                        className="text-base font-semibold text-[color:var(--fg-accent,var(--fg-base))]"
                      >
                        {item.price}
                      </span>
                    </p>
                  </div>
                </Link>
                {item.variant === null && choose ? (
                  <Link
                    href={href}
                    className={clx(
                      "ms-24 inline-flex min-h-11 items-center rounded-[var(--radius)] text-base font-medium text-ui-fg-interactive underline-offset-4 hover:text-ui-fg-interactive-hover hover:underline min-[720px]:ms-0",
                      focusRing
                    )}
                  >
                    {choose}
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div
          data-role="card"
          className="flex flex-col gap-4 rounded-[var(--radius)] border border-ui-border-base bg-ui-bg-subtle p-6"
        >
          {name || line ? (
            <div className="flex flex-col gap-1">
              {name ? <h3 className="text-xl font-medium leading-snug text-ui-fg-base">{name}</h3> : null}
              {line ? <p className="text-base text-ui-fg-subtle">{line}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <p className="text-base text-ui-fg-subtle">{pickText(totalLabel, locale)}</p>
            <p className="text-2xl font-semibold tabular-nums text-ui-fg-base">{bundle.total}</p>
          </div>
          {lines.length ? (
            <AddBundleButton
              lines={lines}
              label={pickText(buttonLabel, locale) ?? ""}
              disabled={bundle.outOfStock.length > 0}
              describedBy={reason ? reasonId : undefined}
              className={BUTTON_CLASS}
            />
          ) : null}
          {reason ? (
            <p id={reasonId} className="text-base text-ui-fg-subtle">
              {reason}
            </p>
          ) : null}
        </div>
      </div>
    </BlockSection>
  )
}
