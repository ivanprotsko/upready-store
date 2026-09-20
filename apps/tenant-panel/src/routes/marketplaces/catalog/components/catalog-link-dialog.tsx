import { Button, Drawer, Input, Select, Text, toast } from "@medusajs/ui"
import { useState } from "react"

import { useVariants } from "../../../../hooks/api/product-variants"
import {
  useLinkMarketplaceCard,
  type CatalogRow,
} from "../../../../hooks/api/marketplace-catalog"

/**
 * The owner chooses which product of her shop a card is (w14-mp-catalog-link).
 *
 * TWO WAYS IN, because two different rows need it. «Требует выбора» already
 * knows the candidates — the several variants that carry this article — and
 * offers exactly them. «Не найдено в магазине» has none, so the dialog
 * searches the whole catalog: the card's article is simply not a SKU here, and
 * refusing to link it would leave the owner with a list she cannot act on.
 *
 * Whatever is chosen is written with `matched_by = 'manual'`, and no import
 * rewrites it afterwards (`planLinkWrites`).
 */
export const CatalogLinkDialog = ({
  row,
  marketplace,
  externalId,
  onDone,
}: {
  row: CatalogRow
  marketplace: string
  externalId: string
  onDone?: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [variantId, setVariantId] = useState<string>(row.candidates[0]?.variant_id ?? "")
  const [search, setSearch] = useState("")

  const searching = row.candidates.length === 0
  const { variants, isPending } = useVariants(
    { q: search || undefined, limit: 20, fields: "id,sku,title,product.title" },
    { enabled: open && searching }
  )

  const { mutate, isPending: isLinking } = useLinkMarketplaceCard({
    onSuccess: () => {
      toast.success(`Карточка ${externalId} связана с товаром магазина.`)
      setOpen(false)
      onDone?.()
    },
    onError: (error) => toast.error(error.message),
  })

  const options = searching
    ? (variants ?? []).map((variant) => ({
        value: variant.id,
        label: `${variant.sku ?? "без SKU"} — ${
          (variant as { product?: { title?: string } }).product?.title ?? variant.title ?? ""
        }`,
      }))
    : row.candidates.map((candidate) => ({
        value: candidate.variant_id,
        label: `${candidate.sku ?? "без SKU"} — ${candidate.product_title ?? ""}`,
      }))

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <Button size="small" variant="secondary">
          {row.candidates.length > 1 ? "Выбрать товар" : "Связать"}
        </Button>
      </Drawer.Trigger>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Связать карточку {marketplace.toUpperCase()}</Drawer.Title>
          <Drawer.Description>
            Артикул {row.vendor_code}, карточка {externalId}. Связь сохранится как ручная и не
            будет перезаписана следующим импортом.
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4">
          {searching ? (
            <div className="flex flex-col gap-y-2">
              <Text size="small" className="text-ui-fg-subtle">
                Ни один товар магазина не несёт этот артикул. Найдите товар вручную:
              </Text>
              <Input
                placeholder="SKU или название товара"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              Артикул несут {row.candidates.length} варианта магазина. Правило сопоставления не
              выбирает между ними — выбор ваш.
            </Text>
          )}

          {isPending && searching ? (
            <Text size="small" className="text-ui-fg-subtle">
              Ищем товары…
            </Text>
          ) : options.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              {searching ? "Ничего не найдено по этому запросу." : "Кандидатов нет."}
            </Text>
          ) : (
            <Select value={variantId} onValueChange={setVariantId}>
              <Select.Trigger>
                <Select.Value placeholder="Выберите товар магазина" />
              </Select.Trigger>
              <Select.Content>
                {options.map((option) => (
                  <Select.Item key={option.value} value={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button size="small" variant="secondary">
              Отмена
            </Button>
          </Drawer.Close>
          <Button
            size="small"
            disabled={!variantId || isLinking}
            onClick={() => mutate({ marketplace, external_id: externalId, variant_id: variantId })}
          >
            Связать
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
