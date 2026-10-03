import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  EMPTY_APP_ICONS,
  type TenantAppIcons,
  type TenantFooterCredit,
  useTenantBranding,
  useUpdateTenantBranding,
} from "../../../hooks/api/branding"
import { useStore } from "../../../hooks/api/store"
import { AppIcons } from "./app-icons"
import { UploadSlot } from "./upload-slot"
import { bestForeground, contrastIsLow } from "./contrast"

// «Бренд владельца» (t16-owner-branding): логотип (светлый/тёмный), фавикон,
// картинка для соцсетей, основной цвет и подпись в подвале. Своя вкладка
// панели, как /settings/notifications рядом — у Admin аналога нет.
//
// Правило 19h, как на экранах уведомлений и оплаты: пока запись грузится,
// рисуются настоящие контролы, только выключенные, а форма заполняется из
// ответа только если владелец её ещё не трогал (touchedRef) — медленный ответ
// не затирает набранное.
//
// t-2026-10-03-61: блок «Иконка приложения» (`app-icons.tsx`) показывает
// набор, который бэкенд собрал из фавикона, так, как его рисуют вкладка
// браузера, iOS и Android, и принимает два необязательных мастера.

type Draft = {
  logo_light_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
  primary_color: string
  shop_name_short: string
  footer_credit: TenantFooterCredit
  app_icons: TenantAppIcons | null
}

const EMPTY_CREDIT: TenantFooterCredit = { enabled: false, text: "", href: null }

const EMPTY_DRAFT: Draft = {
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: null,
  og_image_url: null,
  primary_color: "",
  shop_name_short: "",
  footer_credit: EMPTY_CREDIT,
  app_icons: null,
}

export const BrandingSettings = () => {
  const { t } = useTranslation()
  const { branding, isPending, isError, error } = useTenantBranding()
  const { store } = useStore()
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current && branding) {
      setDraft({
        logo_light_url: branding.logo_light_url,
        logo_dark_url: branding.logo_dark_url,
        favicon_url: branding.favicon_url,
        og_image_url: branding.og_image_url,
        primary_color: branding.primary_color ?? "",
        shop_name_short: branding.shop_name_short ?? "",
        footer_credit: branding.footer_credit ?? EMPTY_CREDIT,
        app_icons: branding.app_icons ?? null,
      })
    }
  }, [isPending, branding])

  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantBranding()

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  // t-2026-10-03-61: a favicon upload answers the whole icon set built from it, so the set is
  // replaced with the favicon and cleared with it; the two optional masters only patch their own
  // fields of the set already there.
  const updateFavicon = (url: string | null, icons?: Partial<TenantAppIcons>) => {
    touchedRef.current = true
    setDraft((previous) => ({
      ...previous,
      favicon_url: url,
      app_icons: url && icons ? { ...EMPTY_APP_ICONS, ...icons } : null,
    }))
  }

  const refineAppIcons = (icons: Partial<TenantAppIcons>) => {
    touchedRef.current = true
    setDraft((previous) =>
      previous.app_icons ? { ...previous, app_icons: { ...previous.app_icons, ...icons } } : previous
    )
  }

  const updateCredit = <K extends keyof TenantFooterCredit>(key: K, value: TenantFooterCredit[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, footer_credit: { ...previous.footer_credit, [key]: value } }))
  }

  // Client-side mirror of the backend's WCAG check (`api/tenants/branding/contrast.ts`):
  // the panel warns as the owner types, the backend's own answer after save stays
  // the source of truth (rule: never silently override the owner's choice).
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(draft.primary_color)
  const lowContrast = isValidHex ? contrastIsLow(draft.primary_color) : false

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await save(
      {
        logo_light_url: draft.logo_light_url,
        logo_dark_url: draft.logo_dark_url,
        favicon_url: draft.favicon_url,
        app_icons: draft.app_icons,
        og_image_url: draft.og_image_url,
        primary_color: draft.primary_color ? draft.primary_color : null,
        shop_name_short: draft.shop_name_short.trim() ? draft.shop_name_short.trim() : null,
        footer_credit: draft.footer_credit.text.trim()
          ? { ...draft.footer_credit, text: draft.footer_credit.text.trim() }
          : { ...draft.footer_credit, enabled: false },
      },
      {
        onSuccess: () => {
          touchedRef.current = false
          toast.success(t("brandingSettings.saved", { defaultValue: "Бренд сохранён" }))
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <form onSubmit={handleSubmit}>
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading>{t("brandingSettings.title", { defaultValue: "Бренд" })}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("brandingSettings.subtitle", {
                defaultValue: "Логотип, фавикон, картинка для соцсетей и основной цвет магазина.",
              })}
            </Text>
          </div>

          <div className="grid grid-cols-1 gap-6 px-6 py-6 sm:grid-cols-2">
            <UploadSlot
              label={t("brandingSettings.fields.logoLight", { defaultValue: "Логотип (светлая тема)" })}
              kind="logo_light"
              url={draft.logo_light_url}
              busy={busy}
              onChange={(url) => update("logo_light_url", url)}
            />
            <UploadSlot
              label={t("brandingSettings.fields.logoDark", { defaultValue: "Логотип (тёмная тема)" })}
              hint={t("brandingSettings.fields.logoDarkHint", {
                defaultValue: "Необязательно — без него используется светлый вариант.",
              })}
              kind="logo_dark"
              url={draft.logo_dark_url}
              busy={busy}
              onChange={(url) => update("logo_dark_url", url)}
            />
            <UploadSlot
              label={t("brandingSettings.fields.favicon", { defaultValue: "Фавикон" })}
              hint={t("brandingSettings.fields.faviconHint", {
                defaultValue: "SVG или квадратный PNG от 512 до 1024 пикселей. Из него собирается иконка приложения.",
              })}
              kind="favicon"
              url={draft.favicon_url}
              busy={busy}
              onChange={updateFavicon}
            />
            <UploadSlot
              label={t("brandingSettings.fields.ogImage", { defaultValue: "Картинка для соцсетей" })}
              hint={t("brandingSettings.fields.ogImageHint", {
                defaultValue: "Показывается при пересылке ссылки на магазин. Минимум 600×315.",
              })}
              kind="og_image"
              url={draft.og_image_url}
              busy={busy}
              onChange={(url) => update("og_image_url", url)}
            />
          </div>

          <AppIcons
            icons={draft.app_icons}
            faviconUrl={draft.favicon_url}
            shopName={draft.shop_name_short || store?.name || t("brandingSettings.previewShopName", { defaultValue: "Магазин" })}
            busy={busy}
            onRefine={refineAppIcons}
          />

          <div className="flex flex-col gap-y-4 px-6 py-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus" htmlFor="primary_color">
                  {t("brandingSettings.fields.primaryColor", { defaultValue: "Основной цвет" })}
                </Label>
                <div className="flex items-center gap-x-2">
                  <input
                    type="color"
                    aria-label={t("brandingSettings.fields.primaryColor", { defaultValue: "Основной цвет" })}
                    value={isValidHex ? draft.primary_color : "#000000"}
                    disabled={busy}
                    onChange={(event) => update("primary_color", event.target.value)}
                    className="h-8 w-10 shrink-0 cursor-pointer rounded border border-ui-border-base bg-transparent p-0"
                  />
                  <Input
                    id="primary_color"
                    value={draft.primary_color}
                    disabled={busy}
                    placeholder="#1a2b3c"
                    onChange={(event) => update("primary_color", event.target.value.trim())}
                  />
                </div>
                {draft.primary_color && !isValidHex ? (
                  <Text size="small" className="text-ui-fg-error">
                    {t("brandingSettings.fields.primaryColorInvalid", {
                      defaultValue: "Введите цвет в формате #RRGGBB.",
                    })}
                  </Text>
                ) : null}
                {lowContrast ? (
                  <Text size="small" className="text-ui-fg-error" data-testid="branding-low-contrast">
                    {t("brandingSettings.fields.lowContrast", {
                      defaultValue:
                        "Этот цвет плохо читается и с белым, и с чёрным текстом — кнопки будет трудно разобрать. Цвет сохранится как есть, но подумайте о более контрастном варианте.",
                    })}
                  </Text>
                ) : null}
              </div>
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus" htmlFor="shop_name_short">
                  {t("brandingSettings.fields.shopNameShort", { defaultValue: "Короткое название" })}
                </Label>
                <Input
                  id="shop_name_short"
                  value={draft.shop_name_short}
                  disabled={busy}
                  maxLength={60}
                  onChange={(event) => update("shop_name_short", event.target.value)}
                />
                <Text size="small" className="text-ui-fg-subtle">
                  {t("brandingSettings.fields.shopNameShortHint", {
                    defaultValue: "Показывается в шапке, если логотип не загружен.",
                  })}
                </Text>
              </div>
            </div>

            {/* Миниатюра шапки — предпросмотр логотипа/цвета до сохранения (шаг 5). */}
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus">
                {t("brandingSettings.preview", { defaultValue: "Предпросмотр шапки" })}
              </Label>
              <div className="flex h-14 items-center justify-between rounded-md border border-ui-border-base bg-ui-bg-base px-4">
                <span className="flex items-center gap-x-2 txt-compact-medium-plus uppercase">
                  {draft.logo_light_url ? (
                    <img src={draft.logo_light_url} alt="" className="h-6 w-auto max-w-[8rem] object-contain" />
                  ) : (
                    draft.shop_name_short || t("brandingSettings.previewShopName", { defaultValue: "Магазин" })
                  )}
                </span>
                <span
                  className="rounded-md px-3 py-1.5 txt-compact-small-plus"
                  style={
                    isValidHex
                      ? { backgroundColor: draft.primary_color, color: bestForeground(draft.primary_color) }
                      : { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                  }
                >
                  {t("brandingSettings.previewButton", { defaultValue: "В корзину" })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-y-4 px-6 py-6">
            <div className="flex items-center gap-x-3">
              <Switch
                id="footer_credit_enabled"
                checked={draft.footer_credit.enabled}
                disabled={busy}
                onCheckedChange={(checked) => updateCredit("enabled", checked)}
              />
              <Label htmlFor="footer_credit_enabled">
                {t("brandingSettings.fields.footerCreditEnabled", {
                  defaultValue: "Подпись в подвале сайта",
                })}
              </Label>
            </div>
            {draft.footer_credit.enabled ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-y-2">
                  <Label size="small" weight="plus" htmlFor="footer_credit_text">
                    {t("brandingSettings.fields.footerCreditText", { defaultValue: "Текст" })}
                  </Label>
                  <Input
                    id="footer_credit_text"
                    value={draft.footer_credit.text}
                    disabled={busy}
                    maxLength={200}
                    onChange={(event) => updateCredit("text", event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label size="small" weight="plus" htmlFor="footer_credit_href">
                    {t("brandingSettings.fields.footerCreditHref", { defaultValue: "Ссылка (необязательно)" })}
                  </Label>
                  <Input
                    id="footer_credit_href"
                    value={draft.footer_credit.href ?? ""}
                    disabled={busy}
                    onChange={(event) => updateCredit("href", event.target.value.trim() || null)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end px-6 py-4">
            <Button type="submit" disabled={busy || (Boolean(draft.primary_color) && !isValidHex)}>
              {t("actions.save", { defaultValue: "Сохранить" })}
            </Button>
          </div>
        </Container>
      </form>
    </SingleColumnPage>
  )
}
