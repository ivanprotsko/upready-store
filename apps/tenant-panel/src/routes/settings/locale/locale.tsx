import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Container, Heading, Label, Select, Text, toast } from "@medusajs/ui"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { Combobox } from "../../../components/inputs/combobox"
import { CountrySelect } from "../../../components/inputs/country-select"
import {
  useTenantLocaleSettings,
  useUpdateTenantLocaleSettings,
  type TenantLocaleSettingsDocument,
} from "../../../hooks/api/locale-settings"
import { LOCALE_LABELS, localeOptions, type LocaleCode } from "../../../lib/locale-catalog"

const DEFAULT_DOCUMENT: TenantLocaleSettingsDocument = {
  default_locale: "ru",
  enabled_locales: ["ru", "en"],
  default_country: null,
}

// t06-locale-currency: no Admin counterpart. Which of the storefront's 36
// locales this shop offers, its default, and the country its default prices
// in — the owner's own pick, replacing the build's shared
// STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN/LOCALE_COUNTRY_MAP for this one shop.
export const LocaleSettings = () => {
  const { t } = useTranslation()
  const { locale_settings: saved, isPending, isError, error } = useTenantLocaleSettings()
  const { mutateAsync, isPending: isSaving } = useUpdateTenantLocaleSettings()

  const [doc, setDoc] = useState<TenantLocaleSettingsDocument>(DEFAULT_DOCUMENT)
  // Three states, not two: "still loading" is not "nothing saved" (rule 19h).
  // `loaded` is what enables Save, and the initial load never overwrites a
  // pick the owner has already made while the request was in flight.
  const [loaded, setLoaded] = useState(false)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending || isError) {
      return
    }
    if (!touchedRef.current) {
      setDoc(saved ?? DEFAULT_DOCUMENT)
    }
    setLoaded(true)
  }, [isPending, isError, saved])

  if (isError) {
    throw error
  }

  const edit = (next: TenantLocaleSettingsDocument) => {
    touchedRef.current = true
    setDoc(next)
  }

  const setEnabledLocales = (codes: string[]) => {
    const enabled_locales = codes as LocaleCode[]
    // The default is always a member of the enabled set: dropping it from the
    // multi-select falls back to whichever enabled locale is now first,
    // rather than saving a document the backend would refuse.
    const default_locale = enabled_locales.includes(doc.default_locale)
      ? doc.default_locale
      : enabled_locales[0]

    edit({ ...doc, enabled_locales, default_locale: default_locale ?? doc.default_locale })
  }

  const onSave = async () => {
    if (doc.enabled_locales.length === 0) {
      toast.error(
        t("localeSettings.needsOneLocale", {
          defaultValue: "Enable at least one language before saving.",
        })
      )
      return
    }

    try {
      await mutateAsync(doc)
      touchedRef.current = false
      toast.success(
        t("localeSettings.saved", { defaultValue: "Language and currency were saved." })
      )
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : t("localeSettings.saveFailed", { defaultValue: "The settings could not be saved." })
      )
    }
  }

  if (isPending) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="flex flex-col gap-y-6 p-6">
        <div>
          <Heading level="h2">
            {t("localeSettings.title", { defaultValue: "Язык и валюта" })}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("localeSettings.subtitle", {
              defaultValue:
                "Какой язык витрина открывает по умолчанию, какие языки видит переключатель, и в какой валюте показывать цены по умолчанию.",
            })}
          </Text>
        </div>

        <div className="flex flex-col gap-y-2 max-w-[420px]">
          <Label size="small" weight="plus" htmlFor="enabled-locales">
            {t("localeSettings.enabledLocales", { defaultValue: "Языки магазина" })}
          </Label>
          <Combobox
            value={doc.enabled_locales}
            onChange={(next) => setEnabledLocales(next ?? [])}
            options={localeOptions}
            displayMode="chips"
            disabled={!loaded}
            placeholder={t("localeSettings.enabledLocalesPlaceholder", {
              defaultValue: "Выберите языки",
            })}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("localeSettings.enabledLocalesHint", {
              defaultValue:
                "Только эти языки увидит переключатель на витрине. Остальные 34 остаются в каталоге, но магазин их не предлагает.",
            })}
          </Text>
        </div>

        <div className="flex flex-col gap-y-2 max-w-[420px]">
          <Label size="small" weight="plus" htmlFor="default-locale">
            {t("localeSettings.defaultLocale", { defaultValue: "Язык по умолчанию" })}
          </Label>
          <Select
            value={doc.default_locale}
            onValueChange={(next) => edit({ ...doc, default_locale: next as LocaleCode })}
            disabled={!loaded || doc.enabled_locales.length === 0}
          >
            <Select.Trigger id="default-locale" data-testid="default-locale">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {doc.enabled_locales.map((code) => (
                <Select.Item key={code} value={code}>
                  {LOCALE_LABELS[code]} ({code})
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("localeSettings.defaultLocaleHint", {
              defaultValue:
                "Посетитель без выбора и без подходящего языка в браузере попадает именно сюда.",
            })}
          </Text>
        </div>

        <div className="flex flex-col gap-y-2 max-w-[420px]">
          <Label size="small" weight="plus" htmlFor="default-country">
            {t("localeSettings.defaultCountry", { defaultValue: "Валюта по умолчанию" })}
          </Label>
          <CountrySelect
            value={doc.default_country ?? undefined}
            onChange={(next) => edit({ ...doc, default_country: next || null })}
            allowClear
            disabled={!loaded}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("localeSettings.defaultCountryHint", {
              defaultValue:
                "Страна, в валюте которой открывается язык по умолчанию — курс не пересчитывается, показываются только цены, заведённые в этом регионе. Пусто — решает регион посетителя.",
            })}
          </Text>
        </div>

        <div>
          <Button size="small" onClick={onSave} isLoading={isSaving} disabled={!loaded}>
            {t("actions.save", { defaultValue: "Сохранить" })}
          </Button>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
