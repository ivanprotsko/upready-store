import { useEffect, useState } from "react"
import { Button, Input, Label, Select, Text, Textarea, toast } from "@medusajs/ui"

import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import {
  useProductTranslations,
  useUpdateProductTranslations,
} from "../../../../../hooks/api/product-translations"
import { LOCALE_LABELS, localeOptions } from "../../../../../lib/locale-catalog"

// t-cherk-37: the body of the «Переводы товара» drawer. One language at a
// time, the way the panel's locale-settings screen picks one language for its
// own preview — switching the picker re-seeds the draft from what is already
// saved for that language, so an unsaved edit must be saved before the owner
// picks another language.

type Draft = {
  title: string
  subtitle: string
  description: string
  options: Record<string, string>
  variants: Record<string, string>
}

const emptyDraft = (): Draft => ({
  title: "",
  subtitle: "",
  description: "",
  options: {},
  variants: {},
})

export const ProductTranslationsForm = ({ productId }: { productId: string }) => {
  const { handleSuccess } = useRouteModal()
  const { product, options, variants, locales, isPending, isError, error } =
    useProductTranslations(productId)
  const [locale, setLocale] = useState<string>("en")
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const { mutateAsync: save, isPending: isSaving } =
    useUpdateProductTranslations(productId)

  useEffect(() => {
    if (!locales) {
      return
    }
    const entry = locales[locale]
    setDraft({
      title: entry?.title ?? "",
      subtitle: entry?.subtitle ?? "",
      description: entry?.description ?? "",
      options: { ...(entry?.options ?? {}) },
      variants: { ...(entry?.variants ?? {}) },
    })
    // Re-seeds on every language switch; `locales` itself only changes after a
    // save, which already carries the just-saved language's own draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, locales])

  if (isError) {
    throw error
  }

  const handleSubmit = async () => {
    await save(
      {
        locale,
        title: draft.title,
        subtitle: draft.subtitle,
        description: draft.description,
        options: draft.options,
        variants: draft.variants,
      },
      {
        onSuccess: () => {
          toast.success(`Перевод на ${LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale} сохранён`)
          handleSuccess()
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <>
      <RouteDrawer.Body className="flex flex-col gap-y-4 overflow-auto">
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus" className="text-ui-fg-subtle">
            Язык
          </Label>
          <Select value={locale} onValueChange={setLocale}>
            <Select.Trigger data-testid="translation-locale">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {localeOptions.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                  {locales?.[option.value] ? " ·  переведено" : ""}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>

        {isPending || !product ? (
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем…
          </Text>
        ) : (
          <>
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus" className="text-ui-fg-subtle">
                Название
              </Label>
              <Input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder={product.title}
                data-testid="translation-title"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus" className="text-ui-fg-subtle">
                Подзаголовок
              </Label>
              <Input
                value={draft.subtitle}
                onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
                placeholder={product.subtitle ?? "—"}
                data-testid="translation-subtitle"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus" className="text-ui-fg-subtle">
                Описание
              </Label>
              <Textarea
                rows={6}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={product.description ?? "—"}
                data-testid="translation-description"
              />
            </div>

            {(options?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus" className="text-ui-fg-subtle">
                  Названия опций
                </Label>
                {options!.map((option) => (
                  <div key={option.id} className="flex flex-col gap-y-1">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {option.title}
                    </Text>
                    <Input
                      value={draft.options[option.id] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          options: { ...current.options, [option.id]: event.target.value },
                        }))
                      }
                      placeholder={option.title}
                      data-testid={`translation-option-${option.id}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {(variants?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus" className="text-ui-fg-subtle">
                  Названия вариантов
                </Label>
                {variants!.map((variant) => (
                  <div key={variant.id} className="flex flex-col gap-y-1">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {variant.title}
                    </Text>
                    <Input
                      value={draft.variants[variant.id] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          variants: { ...current.variants, [variant.id]: event.target.value },
                        }))
                      }
                      placeholder={variant.title}
                      data-testid={`translation-variant-${variant.id}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
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
            disabled={isPending || !product}
            data-testid="save-translations"
          >
            Сохранить
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}
