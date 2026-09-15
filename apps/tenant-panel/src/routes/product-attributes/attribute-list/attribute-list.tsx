import { useState } from "react"
import { Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { Link, useNavigate } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useProductCategories } from "../../../hooks/api/categories"
import {
  ProductAttributeType,
  useCreateProductAttribute,
  useProductAttributes,
} from "../../../hooks/api/product-attributes"
import {
  ATTRIBUTE_TYPES,
  TYPE_HINTS,
  TYPE_LABELS,
  isValidAttributeKey,
  suggestMachineValue,
} from "../attribute-labels"

// t15-product-attributes: the shop's own characteristics. The panel's own
// screen, no Admin counterpart, built from the primitives the journal and the
// pages screens use (SingleColumnPage, Container, Heading, Table, StatusBadge)
// so it sits in the Admin's shell unchanged.
//
// The list is the SCHEMA, not the data: one row per characteristic the owner
// declared, with the two flags that decide where it shows up. Values live on
// each product's own screen.

export const AttributeList = () => {
  const navigate = useNavigate()
  const { product_attributes: attributes, isPending, isError, error } = useProductAttributes()
  const { product_categories: categories } = useProductCategories({ limit: 200 })

  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [keyTouched, setKeyTouched] = useState(false)
  const [type, setType] = useState<ProductAttributeType>("text")
  const { mutateAsync: createAttribute, isPending: isCreating } = useCreateProductAttribute()

  if (isError) {
    throw error
  }

  if (isPending || !attributes) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const categoryName = (categoryId: string | null) => {
    if (!categoryId) {
      return "Весь каталог"
    }
    return categories?.find((category) => category.id === categoryId)?.name ?? "Категория удалена"
  }

  // The machine key follows the name until the owner edits it by hand: after
  // that it is theirs, because it is what a filter URL and a CSV column carry.
  const handleNameChange = (value: string) => {
    setName(value)
    if (!keyTouched) {
      setKey(suggestMachineValue(value))
    }
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const nameValue = name.trim()
    const keyValue = key.trim().toLowerCase()

    if (!nameValue) {
      toast.error("Укажите название характеристики.")
      return
    }

    if (!isValidAttributeKey(keyValue)) {
      toast.error(
        "Служебное имя: строчные латинские буквы, цифры и подчёркивания, от 2 до 40 символов."
      )
      return
    }

    await createAttribute(
      {
        key: keyValue,
        name: nameValue,
        type,
        // A choice list cannot be empty, so a new one starts with a first
        // choice the owner renames on the next screen.
        ...(type === "select"
          ? { options: [{ value: "znachenie_1", label: "Значение 1" }] }
          : {}),
      },
      {
        onSuccess: (created) => {
          setName("")
          setKey("")
          setKeyTouched(false)
          toast.success("Характеристика создана")
          navigate(created.product_attribute.id)
        },
        onError: (createError) => toast.error(createError.message),
      }
    )
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={attributes}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Характеристики товаров</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Свойства, которыми магазин описывает товары: состав, объём, страна.
            Показанная характеристика выводится на карточке товара, фильтруемая
            становится фильтром в каталоге — это два независимых переключателя.
            Значения заполняются на самом товаре, в разделе «Характеристики».
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Характеристика</Table.HeaderCell>
              <Table.HeaderCell>Служебное имя</Table.HeaderCell>
              <Table.HeaderCell>Тип</Table.HeaderCell>
              <Table.HeaderCell>Где применяется</Table.HeaderCell>
              <Table.HeaderCell>Где видна</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {attributes.length === 0 ? (
              <Table.Row>
                {/* `Table.Cell` of @medusajs/ui takes no colSpan, so the empty
                    state fills the first cell and the rest stay blank. */}
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    Характеристик пока нет. Создайте первую — форма ниже.
                  </Text>
                </Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : null}
            {attributes.map((attribute) => (
              <Table.Row key={attribute.id}>
                <Table.Cell>
                  <Link
                    to={attribute.id}
                    className="text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                  >
                    <Text size="small" weight="plus">
                      {attribute.name}
                    </Text>
                  </Link>
                  {attribute.type === "select" && attribute.options.length ? (
                    <Text size="small" className="text-ui-fg-subtle line-clamp-1">
                      {attribute.options.map((option) => option.label).join(", ")}
                    </Text>
                  ) : null}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle font-mono">
                    {attribute.key}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {TYPE_LABELS[attribute.type]}
                    {attribute.unit ? `, ${attribute.unit}` : ""}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {categoryName(attribute.category_id)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge color={attribute.show_on_product ? "green" : "grey"}>
                      На карточке
                    </StatusBadge>
                    <StatusBadge color={attribute.use_as_filter ? "green" : "grey"}>
                      В фильтрах
                    </StatusBadge>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-x-3 gap-y-2 px-6 py-4"
        >
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Название
            </Text>
            <Input
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Состав"
              className="w-[280px]"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Служебное имя
            </Text>
            <Input
              value={key}
              onChange={(event) => {
                setKeyTouched(true)
                setKey(event.target.value)
              }}
              placeholder="sostav"
              className="font-mono w-[200px]"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Тип
            </Text>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ProductAttributeType)}
              className="bg-ui-bg-field border-ui-border-base h-8 rounded-md border px-2 text-ui-fg-base txt-compact-small"
            >
              {ATTRIBUTE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <Button size="small" type="submit" isLoading={isCreating}>
            <Plus /> Новая характеристика
          </Button>
          <Text size="small" className="text-ui-fg-subtle basis-full">
            {TYPE_HINTS[type]}
          </Text>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
