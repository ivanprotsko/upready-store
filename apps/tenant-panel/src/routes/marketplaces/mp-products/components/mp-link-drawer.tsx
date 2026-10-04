import { Button, Drawer, Input, Label, RadioGroup, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useLinkMarketplaceCard } from "../../../../hooks/api/marketplace-catalog"
import { MARKETPLACE_LABEL, MP_FIXTURES, type MpProductRow } from "../../../../hooks/api/marketplace-section"
import { useVariants } from "../../../../hooks/api/product-variants"

/**
 * «Связать с товаром магазина» (mp-section-design): the drawer the row menu
 * opens for a card the matcher could not place. The owner finds her product
 * by SKU or title and picks one; the link is written as `manual`, and no
 * import rewrites it afterwards (`planLinkWrites`, w14).
 *
 * The same `Drawer` the shop's screens use, with a radio list rather than a
 * select, so the candidates are read at a glance.
 */
export const MpLinkDrawer = ({ product, onClose }: { product: MpProductRow; onClose: () => void }) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState(product.vendor_code ?? "")
  const [variantId, setVariantId] = useState<string>("")

  const { variants, isPending } = useVariants(
    { q: search || undefined, limit: 20, fields: "id,sku,title,product.title,product.thumbnail" },
    { enabled: !MP_FIXTURES }
  )

  const { mutateAsync: link, isPending: isLinking } = useLinkMarketplaceCard()

  const options = MP_FIXTURES
    ? FIXTURE_CANDIDATES.filter((c) => !search || c.label.toLowerCase().includes(search.toLowerCase()) || c.sku.includes(search))
    : (variants ?? []).map((variant) => ({
        value: variant.id,
        sku: variant.sku ?? "",
        label: (variant as { product?: { title?: string } }).product?.title ?? variant.title ?? "",
      }))

  const submit = async () => {
    try {
      if (!MP_FIXTURES) {
        await link({ marketplace: product.marketplace, external_id: product.external_id, variant_id: variantId })
      }
      toast.success(t("mp.products.toasts.linked", { title: product.title ?? product.external_id }))
      onClose()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
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
              value={search}
              placeholder={t("mp.products.link.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {isPending && !MP_FIXTURES ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("general.loading")}
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
                  className="hover:bg-ui-bg-subtle-hover flex cursor-pointer items-center gap-x-3 rounded-md px-2 py-2"
                >
                  <RadioGroup.Item value={option.value} />
                  <div className="flex min-w-0 flex-col">
                    <Text size="small" weight="plus" className="truncate">
                      {option.label}
                    </Text>
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

const FIXTURE_CANDIDATES = [
  { value: "variant_0001", sku: "168523959-CHERKASHINO", label: "Мумиё алтайское очищенное, 100 таблеток" },
  { value: "variant_0002", sku: "168523966-CHERKASHINO", label: "Мазь с АСД-3 15%, 100 мл" },
  { value: "variant_0003", sku: "168523973-CHERKASHINO", label: "Иван-чай ферментированный крупнолистовой, 100 г" },
]
