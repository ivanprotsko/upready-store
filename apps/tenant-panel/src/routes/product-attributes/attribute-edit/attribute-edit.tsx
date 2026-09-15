import { useEffect, useRef, useState } from "react"
import { Plus, Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Prompt,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useNavigate, useParams } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useProductCategories } from "../../../hooks/api/categories"
import { useTenantLocaleSettings } from "../../../hooks/api/locale-settings"
import { LOCALE_LABELS, type LocaleCode } from "../../../lib/locale-catalog"
import {
  ProductAttributeOptionBody,
  ProductAttributeType,
  useDeleteProductAttribute,
  useProductAttribute,
  useUpdateProductAttribute,
} from "../../../hooks/api/product-attributes"
import {
  ATTRIBUTE_TYPES,
  OPTION_VALUE_PATTERN,
  TYPE_HINTS,
  TYPE_LABELS,
  suggestMachineValue,
} from "../attribute-labels"

// t15-product-attributes: the editor of ONE characteristic. Everything the
// owner can change about it is here, and it is saved whole — the route replaces
// the choice list on every save, so a choice removed here disappears from the
// products that used it (the response says how many values that cost).
//
// `key` is deliberately read-only: it is what a filter URL and a CSV column
// address, so renaming it would break both. The display name is what the owner
// renames.

type OptionDraft = ProductAttributeOptionBody & { valueTouched: boolean }

export const AttributeEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { product_attribute: attribute, isPending, isError, error } = useProductAttribute(id!)
  const { product_categories: categories } = useProductCategories({ limit: 200 })
  const { locale_settings: localeSettings } = useTenantLocaleSettings()

  const { mutateAsync: save, isPending: isSaving } = useUpdateProductAttribute(id!)
  const { mutateAsync: remove, isPending: isDeleting } = useDeleteProductAttribute(id!)

  const [name, setName] = useState("")
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [type, setType] = useState<ProductAttributeType>("text")
  const [unit, setUnit] = useState("")
  const [position, setPosition] = useState(0)
  const [categoryId, setCategoryId] = useState("")
  const [showOnProduct, setShowOnProduct] = useState(true)
  const [useAsFilter, setUseAsFilter] = useState(false)
  const [options, setOptions] = useState<OptionDraft[]>([])

  // The fetch resolves whenever the network decides. Filling the form from a
  // late answer would wipe what the owner has already typed, so the answer
  // seeds the form ONCE (rule 19h) and every later refetch leaves it alone.
  const seeded = useRef(false)

  useEffect(() => {
    if (!attribute || seeded.current) {
      return
    }
    seeded.current = true
    setName(attribute.name)
    setTranslations(attribute.translations ?? {})
    setType(attribute.type)
    setUnit(attribute.unit ?? "")
    setPosition(attribute.position)
    setCategoryId(attribute.category_id ?? "")
    setShowOnProduct(attribute.show_on_product)
    setUseAsFilter(attribute.use_as_filter)
    setOptions(
      attribute.options.map((option) => ({
        value: option.value,
        label: option.label,
        translations: option.translations ?? {},
        valueTouched: true,
      }))
    )
  }, [attribute])

  if (isError) {
    throw error
  }

  if (isPending || !attribute || !seeded.current) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  // The languages this shop actually offers, so the owner translates «Состав»
  // into the two languages of their storefront rather than into 36.
  const otherLocales = (localeSettings?.enabled_locales ?? []).filter(
    (code) => code !== localeSettings?.default_locale
  )

  const setOptionAt = (index: number, patch: Partial<OptionDraft>) =>
    setOptions((current) =>
      current.map((option, at) => (at === index ? { ...option, ...patch } : option))
    )

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error("Укажите название характеристики.")
      return
    }

    if (type === "select") {
      if (!options.length) {
        toast.error("У характеристики-списка должно быть хотя бы одно значение.")
        return
      }
      const broken = options.find(
        (option) => !option.label.trim() || !OPTION_VALUE_PATTERN.test(option.value.trim())
      )
      if (broken) {
        toast.error(
          "У каждого значения нужны название и служебное имя: строчные латинские буквы, цифры, дефисы или подчёркивания."
        )
        return
      }
      const values = options.map((option) => option.value.trim())
      if (new Set(values).size !== values.length) {
        toast.error("Служебные имена значений должны быть разными.")
        return
      }
    }

    const cleanTranslations = (source: Record<string, string> | undefined) =>
      Object.fromEntries(
        Object.entries(source ?? {}).filter(([, value]) => value?.trim())
      )

    await save(
      {
        name: trimmedName,
        translations: cleanTranslations(translations),
        type,
        unit: unit.trim() ? unit.trim() : null,
        position,
        category_id: categoryId || null,
        show_on_product: showOnProduct,
        use_as_filter: useAsFilter,
        ...(type === "select"
          ? {
              options: options.map((option) => ({
                value: option.value.trim(),
                label: option.label.trim(),
                translations: cleanTranslations(option.translations),
              })),
            }
          : {}),
      },
      {
        onSuccess: (saved) => {
          toast.success(
            saved.cleared_values
              ? `Сохранено. Значений очищено: ${saved.cleared_values}`
              : "Сохранено"
          )
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  const handleDelete = async () => {
    await remove(undefined, {
      onSuccess: () => {
        toast.success("Характеристика удалена")
        navigate("/product-attributes")
      },
      onError: (deleteError) => toast.error(deleteError.message),
    })
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={attribute}>
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h2">{attribute.name}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Служебное имя <span className="font-mono">{attribute.key}</span> — его
              нельзя изменить: по нему построены адреса фильтров и колонки импорта.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <Prompt>
              <Prompt.Trigger asChild>
                <Button size="small" variant="secondary" isLoading={isDeleting}>
                  <Trash /> Удалить
                </Button>
              </Prompt.Trigger>
              <Prompt.Content>
                <Prompt.Header>
                  <Prompt.Title>Удалить характеристику?</Prompt.Title>
                  <Prompt.Description>
                    Вместе с ней исчезнут её значения у всех товаров и её фильтр в
                    каталоге. Отменить это нельзя.
                  </Prompt.Description>
                </Prompt.Header>
                <Prompt.Footer>
                  <Prompt.Cancel>Отмена</Prompt.Cancel>
                  <Prompt.Action onClick={handleDelete}>Удалить</Prompt.Action>
                </Prompt.Footer>
              </Prompt.Content>
            </Prompt>
            <Button size="small" onClick={handleSave} isLoading={isSaving}>
              Сохранить
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-y-4 px-6 py-4">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Название
              </Text>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-[280px]"
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
            {type === "number" ? (
              <div className="flex flex-col gap-y-1">
                <Text size="small" className="text-ui-fg-subtle">
                  Единица измерения
                </Text>
                <Input
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder="мл"
                  className="w-[120px]"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Порядок
              </Text>
              <Input
                type="number"
                value={String(position)}
                onChange={(event) => setPosition(Number(event.target.value) || 0)}
                className="w-[100px]"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Где применяется
              </Text>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="bg-ui-bg-field border-ui-border-base h-8 rounded-md border px-2 text-ui-fg-base txt-compact-small"
              >
                <option value="">Весь каталог</option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {TYPE_HINTS[type]} Характеристика, привязанная к категории,
            применяется и к её подкатегориям.
          </Text>

          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <label className="flex items-center gap-x-2">
              <Switch checked={showOnProduct} onCheckedChange={setShowOnProduct} />
              <span className="flex flex-col">
                <Text size="small">Показывать на карточке товара</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Строка в блоке «Характеристики» на странице товара.
                </Text>
              </span>
            </label>
            <label className="flex items-center gap-x-2">
              <Switch checked={useAsFilter} onCheckedChange={setUseAsFilter} />
              <span className="flex flex-col">
                <Text size="small">Использовать как фильтр</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Фильтр в каталоге. Для числа — диапазон «от и до».
                </Text>
              </span>
            </label>
          </div>
        </div>

        {otherLocales.length ? (
          <div className="flex flex-col gap-y-3 px-6 py-4">
            <div className="flex flex-col gap-y-1">
              <Heading level="h3">Перевод названия</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Название на языках витрины. Пустое поле — посетитель увидит
                название выше.
              </Text>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              {otherLocales.map((code: LocaleCode) => (
                <div key={code} className="flex flex-col gap-y-1">
                  <Text size="small" className="text-ui-fg-subtle">
                    {LOCALE_LABELS[code]}
                  </Text>
                  <Input
                    value={translations[code] ?? ""}
                    onChange={(event) =>
                      setTranslations((current) => ({
                        ...current,
                        [code]: event.target.value,
                      }))
                    }
                    className="w-[240px]"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {type === "select" ? (
          <div className="flex flex-col gap-y-3 px-6 py-4">
            <div className="flex flex-col gap-y-1">
              <Heading level="h3">Значения</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Закрытый список: товар может нести только одно из этих значений.
                Служебное имя попадает в адрес фильтра, название видит покупатель.
              </Text>
            </div>
            {options.map((option, index) => (
              <div key={index} className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="flex flex-col gap-y-1">
                  <Text size="small" className="text-ui-fg-subtle">
                    Название
                  </Text>
                  <Input
                    value={option.label}
                    onChange={(event) => {
                      const label = event.target.value
                      setOptionAt(index, {
                        label,
                        ...(option.valueTouched
                          ? {}
                          : { value: suggestMachineValue(label) }),
                      })
                    }}
                    className="w-[220px]"
                  />
                </div>
                <div className="flex flex-col gap-y-1">
                  <Text size="small" className="text-ui-fg-subtle">
                    Служебное имя
                  </Text>
                  <Input
                    value={option.value}
                    onChange={(event) =>
                      setOptionAt(index, { value: event.target.value, valueTouched: true })
                    }
                    className="font-mono w-[180px]"
                  />
                </div>
                {otherLocales.map((code: LocaleCode) => (
                  <div key={code} className="flex flex-col gap-y-1">
                    <Text size="small" className="text-ui-fg-subtle">
                      {LOCALE_LABELS[code]}
                    </Text>
                    <Input
                      value={option.translations?.[code] ?? ""}
                      onChange={(event) =>
                        setOptionAt(index, {
                          translations: {
                            ...(option.translations ?? {}),
                            [code]: event.target.value,
                          },
                        })
                      }
                      className="w-[200px]"
                    />
                  </div>
                ))}
                <IconButton
                  size="small"
                  variant="transparent"
                  onClick={() =>
                    setOptions((current) => current.filter((_, at) => at !== index))
                  }
                >
                  <Trash />
                </IconButton>
              </div>
            ))}
            <div>
              <Button
                size="small"
                variant="secondary"
                onClick={() =>
                  setOptions((current) => [
                    ...current,
                    { value: "", label: "", translations: {}, valueTouched: false },
                  ])
                }
              >
                <Plus /> Добавить значение
              </Button>
            </div>
          </div>
        ) : null}
      </Container>
    </SingleColumnPage>
  )
}
