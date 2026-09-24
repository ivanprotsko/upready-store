import {
  Button,
  Checkbox,
  Container,
  Heading,
  Label,
  RadioGroup,
  Text,
  toast,
} from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useMyShops } from "../../../../../hooks/api/shops"
import {
  ProductSiteFields,
  SiteScope,
  useUpdateProductSiteScope,
} from "../../../../../hooks/api/site-scope"

type ProductSitesSectionProps = {
  product: HttpTypes.AdminProduct & ProductSiteFields
}

type Mode = "all" | "selected"

const modeOf = (scope: SiteScope | undefined): Mode =>
  scope === "all" || scope === undefined ? "all" : "selected"

const idsOf = (scope: SiteScope | undefined): string[] =>
  scope && scope !== "all" ? scope.tenant_ids : []

/**
 * t-2026-09-24-n12: «везде / на выбранных сайтах» for a product of an owner
 * with several sites. Rendered only when the backend sent `site_scope`, which
 * it does for a shop with more than one site; a one-site shop never sees this
 * card. A product another site owns is shown read-only: its sites are changed
 * on the site it belongs to.
 */
export const ProductSitesSection = ({ product }: ProductSitesSectionProps) => {
  const { t } = useTranslation()
  const { shops } = useMyShops()
  const sites = useMemo(
    () => (shops ?? []).filter((shop) => shop.same_group),
    [shops]
  )

  const [mode, setMode] = useState<Mode>(modeOf(product.site_scope))
  const [selected, setSelected] = useState<string[]>(idsOf(product.site_scope))

  useEffect(() => {
    setMode(modeOf(product.site_scope))
    setSelected(idsOf(product.site_scope))
  }, [product.site_scope])

  const { mutateAsync, isPending } = useUpdateProductSiteScope(product.id)

  if (product.site_scope === undefined) {
    return null
  }

  const readOnly = product.owned === false
  const nameOf = (id: string) =>
    sites.find((site) => site.id === id)?.name ?? id

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) =>
      checked ? [...new Set([...current, id])] : current.filter((x) => x !== id)
    )

  const save = async () => {
    const siteScope: SiteScope =
      mode === "all" ? "all" : { tenant_ids: selected }

    await mutateAsync(
      { site_scope: siteScope },
      {
        onSuccess: () => toast.success(t("products.sites.saved")),
        onError: (error) => toast.error(error.message),
      }
    )
  }

  const canSave = mode === "all" || selected.length > 0

  return (
    <Container className="flex flex-col gap-y-4 px-6 py-4">
      <Heading level="h2">{t("products.sites.header")}</Heading>

      {readOnly ? (
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("products.sites.readOnly")}
        </Text>
      ) : null}

      {readOnly ? (
        <Text size="small" leading="compact">
          {product.site_scope === "all"
            ? t("products.sites.all")
            : idsOf(product.site_scope).map(nameOf).join(", ")}
        </Text>
      ) : (
        <>
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as Mode)}
            className="flex flex-col gap-y-3"
          >
            <div className="flex items-center gap-x-2">
              <RadioGroup.Item value="all" id="product-sites-all" />
              <Label htmlFor="product-sites-all" size="small">
                {t("products.sites.all")}
              </Label>
            </div>
            <div className="flex items-center gap-x-2">
              <RadioGroup.Item value="selected" id="product-sites-selected" />
              <Label htmlFor="product-sites-selected" size="small">
                {t("products.sites.selected")}
              </Label>
            </div>
          </RadioGroup>

          {mode === "selected" ? (
            <div className="flex flex-col gap-y-2 pl-6">
              {sites.map((site) => (
                <div key={site.id} className="flex items-center gap-x-2">
                  <Checkbox
                    id={`product-site-${site.id}`}
                    checked={selected.includes(site.id)}
                    onCheckedChange={(checked) =>
                      toggle(site.id, checked === true)
                    }
                  />
                  <Label htmlFor={`product-site-${site.id}`} size="small">
                    {site.name}
                  </Label>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              size="small"
              variant="secondary"
              onClick={save}
              isLoading={isPending}
              disabled={!canSave}
            >
              {t("actions.save")}
            </Button>
          </div>
        </>
      )}
    </Container>
  )
}
