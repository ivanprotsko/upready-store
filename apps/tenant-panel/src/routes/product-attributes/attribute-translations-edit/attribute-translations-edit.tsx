import { Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { LOCALE_LABELS } from "../../../lib/locale-catalog"
import { useAttributeSave, useOtherLocales } from "../use-attribute-save"

// t-2026-10-14-01 (panel redesign, G2): «Перевод названия» of the card, on
// `/product-attributes/:id/translations/edit`. One field per language of the
// storefront besides its default; an empty field means the visitor sees the
// name itself. The save sends the whole record (`useAttributeSave`).

type TranslationsDraft = { translations: Record<string, string> }

const schema = zod.object({ translations: zod.record(zod.string(), zod.string().max(200)) })

export const AttributeTranslationsEdit = () => {
  const { t } = useTranslation()
  const { attribute, isPending, save, savedMessage } = useAttributeSave()
  const { locales, isPending: localesPending } = useOtherLocales()

  return (
    <SettingsEditDrawer<TranslationsDraft>
      title={t("productAttributes.translations.title")}
      description={t("productAttributes.translations.description")}
      isPending={isPending || localesPending}
      schema={schema}
      defaultValues={{
        translations: Object.fromEntries(
          locales.map((code) => [code, attribute?.translations?.[code] ?? ""])
        ),
      }}
      onSubmit={(draft) =>
        save({ translations: { ...(attribute?.translations ?? {}), ...draft.translations } })
      }
      successMessage={savedMessage}
    >
      {(form) => (
        <>
          {locales.map((code) => (
            <Form.Field
              key={code}
              control={form.control}
              name={`translations.${code}`}
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>{LOCALE_LABELS[code]}</Form.Label>
                  <Form.Control>
                    <Input {...field} autoComplete="off" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          ))}
        </>
      )}
    </SettingsEditDrawer>
  )
}
