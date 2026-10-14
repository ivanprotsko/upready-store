import { EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { Container, Heading, IconButton, StatusBadge, Table, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { SettingsDetailSection, SettingsSection } from "../../../components/settings"
import { TableScroll } from "../../../components/table/table-scroll"
import { useProductCategories } from "../../../hooks/api/categories"
import { ProductAttribute, useProductAttribute } from "../../../hooks/api/product-attributes"
import { LOCALE_LABELS, type LocaleCode } from "../../../lib/locale-catalog"
import { useAttributeDelete } from "../use-attribute-delete"
import { useOtherLocales } from "../use-attribute-save"

// t-2026-10-14-01 (panel redesign, G2, prototype state `attribute`): the card
// of one characteristic after panel-ds E2. It only reads; the form that stood
// on this page went into three drawers, one per section:
//   «Общее» → `edit`, «Перевод названия» → `translations/edit` (only when the
//   storefront has more than one language), «Значения» → `values/edit` (only
//   for a choice list).
// «Удалить» is the last item of the first section's «…», behind a prompt.
// The values are a small table (a list is at most a few dozen), not rows.

const ValuesSection = ({
  attribute,
  locales,
}: {
  attribute: ProductAttribute
  locales: LocaleCode[]
}) => {
  const { t } = useTranslation()
  const options = [...attribute.options].sort((a, b) => a.position - b.position)

  return (
    <Container className="divide-y p-0" data-testid="settings-section-values">
      <div className="flex items-center justify-between gap-x-4 px-6 py-4">
        <div className="min-w-0">
          <Heading level="h2">{t("productAttributes.values.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle text-pretty">
            {t("productAttributes.values.description")}
          </Text>
        </div>
        <ActionMenu
          groups={[
            {
              actions: [{ icon: <PencilSquare />, label: t("actions.change"), to: "values/edit" }],
            },
          ]}
        >
          <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
            <EllipsisHorizontal />
          </IconButton>
        </ActionMenu>
      </div>
      <TableScroll>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("productAttributes.fields.valueLabel")}</Table.HeaderCell>
              <Table.HeaderCell>{t("productAttributes.fields.key")}</Table.HeaderCell>
              {locales.map((code) => (
                <Table.HeaderCell key={code}>{LOCALE_LABELS[code]}</Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {options.map((option) => (
              <Table.Row key={option.id}>
                <Table.Cell className="whitespace-nowrap">{option.label}</Table.Cell>
                <Table.Cell className="whitespace-nowrap font-mono">{option.value}</Table.Cell>
                {locales.map((code) => (
                  <Table.Cell key={code} className="whitespace-nowrap">
                    {option.translations?.[code] || "—"}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </TableScroll>
    </Container>
  )
}

const AttributeCard = ({ attribute }: { attribute: ProductAttribute }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { product_categories: categories } = useProductCategories({ limit: 200 })
  const { locales } = useOtherLocales()
  const remove = useAttributeDelete(attribute)

  const typeName = t(`productAttributes.types.${attribute.type}`)
  const categoryName = !attribute.category_id
    ? t("productAttributes.allCatalog")
    : (categories?.find((category) => category.id === attribute.category_id)?.name ??
      t("productAttributes.categoryGone"))

  const general: SettingsSection = {
    id: "general",
    title: attribute.name,
    status: attribute.show_on_product
      ? { color: "green", label: t("productAttributes.shown") }
      : { color: "grey", label: t("productAttributes.hidden") },
    action: attribute.use_as_filter ? (
      <StatusBadge color="green">{t("productAttributes.filterBadge")}</StatusBadge>
    ) : undefined,
    actions: [
      { actions: [{ icon: <PencilSquare />, label: t("actions.change"), to: "edit" }] },
      {
        actions: [
          {
            icon: <Trash />,
            label: t("actions.delete"),
            onClick: async () => {
              if (await remove()) {
                navigate("/product-attributes", { replace: true })
              }
            },
          },
        ],
      },
    ],
    rows: [
      { id: "name", label: t("productAttributes.fields.name"), value: attribute.name },
      {
        id: "key",
        label: t("productAttributes.fields.key"),
        value: attribute.key,
        mono: true,
        hint: t("productAttributes.fields.keyLocked"),
      },
      {
        id: "type",
        label: t("productAttributes.fields.type"),
        value: attribute.unit
          ? t("productAttributes.typeWithUnit", { type: typeName, unit: attribute.unit })
          : typeName,
      },
      { id: "position", label: t("productAttributes.fields.position"), value: String(attribute.position) },
      { id: "category", label: t("productAttributes.fields.category"), value: categoryName },
      {
        id: "show-on-product",
        label: t("productAttributes.fields.showOnProduct"),
        status: attribute.show_on_product
          ? { color: "green", label: t("productAttributes.shown") }
          : { color: "grey", label: t("productAttributes.hidden") },
        hint: t("productAttributes.fields.showOnProductHint"),
      },
      {
        id: "use-as-filter",
        label: t("productAttributes.fields.useAsFilter"),
        status: attribute.use_as_filter
          ? { color: "green", label: t("productAttributes.filterOn") }
          : { color: "grey", label: t("productAttributes.filterOff") },
        hint: t("productAttributes.fields.useAsFilterHint"),
      },
    ],
  }

  const translations: SettingsSection = {
    id: "translations",
    title: t("productAttributes.translations.title"),
    description: t("productAttributes.translations.description"),
    editTo: "translations/edit",
    rows: locales.map((code) => ({
      id: `translation-${code}`,
      label: LOCALE_LABELS[code],
      value: attribute.translations?.[code],
    })),
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <SettingsDetailSection section={general} level="h1" />
      {locales.length ? <SettingsDetailSection section={translations} /> : null}
      {attribute.type === "select" ? <ValuesSection attribute={attribute} locales={locales} /> : null}
    </SingleColumnPage>
  )
}

export const AttributeDetail = () => {
  const { id } = useParams()
  const { product_attribute: attribute, isPending, isError, error } = useProductAttribute(id!)

  if (isError) {
    throw error
  }

  if (isPending || !attribute) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  return <AttributeCard attribute={attribute} />
}
