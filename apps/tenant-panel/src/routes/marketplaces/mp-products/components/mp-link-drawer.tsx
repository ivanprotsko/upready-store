import { Button, Drawer, Input, Label, RadioGroup, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Thumbnail } from "../../../../components/common/thumbnail"
import { MARKETPLACE_LABEL, MP_FIXTURES, type MpProductRow } from "../../../../hooks/api/marketplace-section"
import { useVariants } from "../../../../hooks/api/product-variants"
import { useMpLinkActions } from "../use-link-actions"

/**
 * «Связать с товаром магазина» (mp-section-design): the drawer the row menu
 * and the card page open for a card the matcher could not place. The owner
 * finds her product by SKU or title and picks one; the link is written as
 * `manual`, and no import rewrites it afterwards (`planLinkWrites`, w14).
 *
 * The search is the shop's own `GET /tenants/product-variants?q=`, debounced.
 * It starts from the card's article when the shop carries it (the candidates
 * of «Требует выбора» are then the first lines), and from an empty query
 * otherwise, which lists the shop's variants: the article of a card «Нет в
 * магазине» matches nothing by definition.
 *
 * The same `Drawer` the shop's screens use, with a radio list rather than a
 * select, so the candidates are read at a glance.
 */
export const MpLinkDrawer = ({
  product,
  onClose,
}: {
  product: Pick<MpProductRow, "id" | "marketplace" | "external_id" | "title" | "vendor_code" | "link">
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState(product.link.candidates > 0 ? (product.vendor_code ?? "") : "")
  const [query, setQuery] = useState(search)
  const [variantId, setVariantId] = useState<string>("")

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { variants, isPending, isError } = useVariants(
    { q: query || undefined, limit: 20, fields: "id,sku,title,product.title,product.thumbnail" },
    { enabled: !MP_FIXTURES, placeholderData: keepPreviousData }
  )

  const { linkTo, isLinking } = useMpLinkActions()

  const options: Option[] = MP_FIXTURES
    ? FIXTURE_CANDIDATES.filter(
        (c) => !search || c.label.toLowerCase().includes(search.toLowerCase()) || c.sku.includes(search)
      )
    : (variants ?? []).map((variant) => {
        const parent = (variant as { product?: { title?: string | null; thumbnail?: string | null } }).product
        return {
          value: variant.id,
          sku: variant.sku ?? "",
          label: parent?.title ?? variant.title ?? "",
          detail: parent?.title && variant.title && variant.title !== parent.title ? variant.title : null,
          thumbnail: parent?.thumbnail ?? null,
        }
      })

  const submit = async () => {
    if (await linkTo(product, variantId)) {
      onClose()
    }
  }

  return (
    <Drawer open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("mp.products.link.title")}</Drawer.Title>
          <Drawer.Description>
            {t("mp.products.link.description", {
              marketplace: MARKETPLACE_LABEL[product.marketplace],
              title: product.title ?? product.external_id,
              vendorCode: product.vendor_code ?? "—",
            })}
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="mp-link-search" size="small" weight="plus">
              {t("mp.products.link.search")}
            </Label>
            <Input
              id="mp-link-search"
              type="search"
              value={search}
              placeholder={t("mp.products.link.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {isPending && !MP_FIXTURES ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("general.loading")}
            </Text>
          ) : isError ? (
            <Text size="small" className="text-ui-fg-error">
              {t("mp.products.link.loadFailed")}
            </Text>
          ) : options.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("mp.products.link.nothingFound")}
            </Text>
          ) : (
            <RadioGroup value={variantId} onValueChange={setVariantId} className="flex flex-col gap-y-1">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="hover:bg-ui-bg-subtle-hover flex min-h-11 cursor-pointer items-center gap-x-3 rounded-md px-2 py-2"
                >
                  <RadioGroup.Item value={option.value} />
                  <Thumbnail src={option.thumbnail} />
                  <div className="flex min-w-0 flex-col">
                    <Text size="small" weight="plus" className="truncate">
                      {option.label}
                    </Text>
                    {option.detail ? (
                      <Text size="xsmall" className="text-ui-fg-subtle truncate">
                        {option.detail}
                      </Text>
                    ) : null}
                    <Text size="xsmall" className="text-ui-fg-subtle tabular-nums">
                      {option.sku ? `${t("fields.sku")} ${option.sku}` : t("mp.products.link.noSku")}
                    </Text>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Button size="small" variant="secondary" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button size="small" disabled={!variantId || isLinking} isLoading={isLinking} onClick={submit}>
            {t("mp.products.actions.link")}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

type Option = { value: string; sku: string; label: string; detail: string | null; thumbnail: string | null }

const FIXTURE_CANDIDATES: Option[] = [
  { value: "variant_0001", sku: "168523959-CHERKASHINO", label: "Мумиё алтайское очищенное, 100 таблеток", detail: null, thumbnail: null },
  { value: "variant_0002", sku: "168523966-CHERKASHINO", label: "Мазь с АСД-3 15%, 100 мл", detail: null, thumbnail: null },
  { value: "variant_0003", sku: "168523973-CHERKASHINO", label: "Иван-чай ферментированный крупнолистовой, 100 г", detail: null, thumbnail: null },
]
