import { useEffect, useRef, useState } from "react"
import { Button, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { Link } from "react-router-dom"

import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import {
  ProductAttributeWithValue,
  useProductAttributeValues,
  useUpdateProductAttributeValues,
} from "../../../../../hooks/api/product-attributes"
import { booleanLabel } from "../../../../product-attributes/attribute-labels"

// t15-product-attributes: the body of the «Характеристики товара» drawer.
//
// ITS OWN FILE BECAUSE OF THE HOOK. `RouteModalProvider` is created INSIDE
// `RouteDrawer` (`components/modals/route-drawer/route-drawer.tsx`), so
// `useRouteModal()` called in the component that RENDERS the drawer never sees
// the context and throws «useRouteModal must be used within a
// RouteModalProvider» — the screen becomes an error page, and neither types nor
// lint catch it because the failure is at runtime. The hook belongs in a child
// the drawer already wraps, which is how `routes/orders/order-export` and the
// Admin's own `product-attributes/components/product-attributes-form` are built.
//
// One control per type: a text field, a number field with its unit beside it, a
// select over the declared choices, and a yes/no select with an explicit
// «Не указано». That empty option is what CLEARS a characteristic, and it has to
// be a real choice rather than an empty text box, because «не выбрано» and
// «нет» are different answers for a yes/no.

const EMPTY = "__empty__"

type Draft = Record<string, string>

const toDraftValue = (attribute: ProductAttributeWithValue): string => {
  if (attribute.value === null || attribute.value === undefined) {
    return attribute.type === "select" || attribute.type === "boolean" ? EMPTY : ""
  }
  return String(attribute.value)
}

const fromDraftValue = (
  attribute: ProductAttributeWithValue,
  raw: string
): string | number | boolean | null => {
  if (raw === EMPTY || raw.trim() === "") {
    return null
  }
  if (attribute.type === "number") {
    const parsed = Number(raw.trim().replace(",", "."))
    return Number.isFinite(parsed) ? parsed : raw.trim()
  }
  if (attribute.type === "boolean") {
    return raw === "true"
  }
  return raw
}

export const ProductCustomAttributesForm = ({
  productId,
}: {
  productId: string
}) => {
  const { handleSuccess } = useRouteModal()
  const {
    product_attributes: attributes,
    isPending,
    isError,
    error,
  } = useProductAttributeValues(productId)
  const { mutateAsync: save, isPending: isSaving } =
    useUpdateProductAttributeValues(productId)

  const [draft, setDraft] = useState<Draft>({})
  // The answer seeds the form ONCE: a refetch landing after the owner started
  // typing must not take their edits with it (rule 19h).
  const seeded = useRef(false)

  useEffect(() => {
    if (!attributes || seeded.current) {
      return
    }
    seeded.current = true
    setDraft(
      Object.fromEntries(
        attributes.map((attribute) => [attribute.key, toDraftValue(attribute)])
      )
    )
  }, [attributes])

  if (isError) {
    throw error
  }

  const handleSubmit = async () => {
    if (!attributes) {
      return
    }

    await save(
      {
        values: attributes.map((attribute) => ({
          key: attribute.key,
          value: fromDraftValue(attribute, draft[attribute.key] ?? ""),
        })),
      },
      {
        onSuccess: () => {
          toast.success("Характеристики сохранены")
          handleSuccess()
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <>
      <RouteDrawer.Body className="flex flex-col gap-y-4 overflow-auto">
        {isPending || !attributes ? (
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем…
          </Text>
        ) : attributes.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Для этого товара характеристик пока не объявлено. Создайте их в
            разделе{" "}
            <Link to="/product-attributes" className="text-ui-fg-interactive">
              «Характеристики товаров»
            </Link>{" "}
            — и укажите там категорию, если характеристика нужна не всему
            каталогу.
          </Text>
        ) : (
          attributes.map((attribute) => {
            const fieldId = `attribute-${attribute.key}`
            return (
              <div key={attribute.key} className="flex flex-col gap-y-1">
                <Label
                  htmlFor={fieldId}
                  size="small"
                  weight="plus"
                  className="text-ui-fg-subtle"
                >
                  {attribute.name}
                  {attribute.unit ? `, ${attribute.unit}` : ""}
                </Label>
                {attribute.type === "select" ? (
                  <Select
                    value={draft[attribute.key] ?? EMPTY}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, [attribute.key]: value }))
                    }
                  >
                    <Select.Trigger id={fieldId} data-testid={fieldId}>
                      <Select.Value placeholder="Не указано" />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value={EMPTY}>Не указано</Select.Item>
                      {attribute.options.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                ) : attribute.type === "boolean" ? (
                  <Select
                    value={draft[attribute.key] ?? EMPTY}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, [attribute.key]: value }))
                    }
                  >
                    <Select.Trigger id={fieldId} data-testid={fieldId}>
                      <Select.Value placeholder="Не указано" />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value={EMPTY}>Не указано</Select.Item>
                      <Select.Item value="true">{booleanLabel(true)}</Select.Item>
                      <Select.Item value="false">{booleanLabel(false)}</Select.Item>
                    </Select.Content>
                  </Select>
                ) : (
                  <Input
                    id={fieldId}
                    type={attribute.type === "number" ? "number" : "text"}
                    value={draft[attribute.key] ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [attribute.key]: event.target.value,
                      }))
                    }
                    placeholder={attribute.type === "number" ? "100" : "Не указано"}
                    data-testid={fieldId}
                  />
                )}
              </div>
            )
          })
        )}
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center justify-end gap-x-2">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              Отмена
            </Button>
          </RouteDrawer.Close>
          <Button
            size="small"
            onClick={handleSubmit}
            isLoading={isSaving}
            disabled={isPending || !attributes?.length}
            data-testid="save-attributes"
          >
            Сохранить
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}
