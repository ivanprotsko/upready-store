"use client"

import CountryFlag from "@modules/common/components/country-flag"
import { updateRegion } from "@lib/data/cart"
import { updateLocale } from "@lib/data/locale-actions"
import type { Locale } from "@i18n/config"
import { ChevronDown, XMark } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import {
  Button,
  Input,
  RadioGroup,
  clx,
} from "@medusajs/ui"
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"
import { regionChoiceCookie } from "@lib/tenant/region-redirects"
import { useRegionRedirects } from "@modules/layout/components/region-popup/context"
import {
  countryOptionsOf,
  countrySearchText,
  languageOptionsOf,
  languageSearchText,
  regionNameOf,
} from "./options"

type RegionSelectProps = {
  regions: HttpTypes.StoreRegion[]
  currentCountryCode?: string
  locales: Locale[]
  className?: string
  /**
   * Branch `redesign-olavka` (t-2026-09-24-n15), the Figma header 227:9557:
   * `"text"` — desktop: flag + country name as plain text, then the currency sign and its
   * code («$ USD»), two `ToggleButton`s of the frame CatalogNav (176:166085, padding 0 16,
   * gap 6, t-2026-10-09-41), no fills; `"icons"` — tablet/mobile: a flag button and a
   * currency-sign button, 36px below 640 and 40px above, no fills, no dividers.
   * The language keeps its tab inside the same dialog. Default: today's two text links.
   */
  variant?: "links" | "text" | "icons"
}

const TEXT_CLASS =
  "inline-flex h-10 items-center gap-x-1.5 rounded-full px-4 font-[family-name:var(--font-olavka-ui)] text-[14px] font-medium leading-[1.1] text-[var(--h7-ink,var(--foreground))] transition-colors hover:bg-[var(--accent)] focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"

const ICON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--h7-ink,var(--foreground))] transition-colors hover:bg-[var(--accent)] focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-10 sm:w-10"

/** The node's «Currency / USD»: the sign alone, Rubik Medium 15. */
const SIGN_CLASS = "font-[family-name:var(--font-olavka-sign)] text-[15px] font-medium leading-[1.1] tracking-[0.01em]"

type RegionOptionRowProps = {
  id: string
  value: string
  label: string
  description: string
  flagCode?: string
}

const RegionOptionRow = ({
  id,
  value,
  label,
  description,
  flagCode,
}: RegionOptionRowProps) => {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-x-3 rounded-lg px-3 py-2 cursor-pointer hover:bg-ui-bg-base-hover transition-colors min-w-0"
    >
      <RadioGroup.Item value={value} id={id} />
      <span className="flex flex-col min-w-0">
        <span className="txt-compact-small text-ui-fg-base truncate">{label}</span>
        <span className="flex items-center gap-x-1.5 txt-compact-xsmall text-ui-fg-subtle truncate">
          {flagCode ? (
            <CountryFlag
              countryCode={flagCode}
              style={{ width: "14px", height: "14px" }}
              className="shrink-0 rounded-sm"
            />
          ) : null}
          {description}
        </span>
      </span>
    </label>
  )
}

const RegionSelect = ({
  regions,
  currentCountryCode,
  locales,
  className,
  variant = "links",
}: RegionSelectProps) => {
  const t = useTranslations("RegionSelect")
  const dir = useLocaleDirection()
  const tLang = useTranslations("LanguageSelect")
  const currentLocale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [pendingCountry, setPendingCountry] = useState(currentCountryCode)
  const [pendingLocale, setPendingLocale] = useState(currentLocale)
  const [query, setQuery] = useState("")

  const countryOptions = useMemo(
    () => countryOptionsOf(regions, currentLocale),
    [regions, currentLocale]
  )

  // t-2026-10-20-22: the countries that lead to another shop (cherkashino.com's
  // «Россия» → cherkashino.ru). Listed first, named by that shop's address, and a
  // pick sends the visitor there, the way the first-visit popup does.
  const redirects = useRegionRedirects()
  const redirectOptions = useMemo(
    () =>
      redirects.map((r) => ({
        country: r.country,
        url: r.url,
        label:
          countryOptions.find((o) => o.country === r.country)?.label ??
          regionNameOf(r.country, currentLocale),
        host: new URL(r.url).host,
      })),
    [redirects, countryOptions, currentLocale]
  )
  const awayCountries = useMemo(
    () => new Set(redirects.map((r) => r.country)),
    [redirects]
  )

  const languageOptions = useMemo(
    () =>
      languageOptionsOf(locales, currentLocale, (l) =>
        tLang(`locales.${l.code}`, { fallback: l.name })
      ),
    [locales, currentLocale, tLang]
  )

  // N9 (t-2026-10-04-19): `regions` are the shop's own (`listShopRegions`), so
  // a shop that sells in one country has nothing to pick there. The dialog then
  // keeps only the languages; with one language as well there is no dialog at
  // all, and the header just names the country and the currency it prices in.
  const canPickCountry = countryOptions.length + redirectOptions.length > 1
  const canPickLanguage = languageOptions.length > 1
  const interactive = canPickCountry || canPickLanguage

  const normalizedQuery = query.trim().toLowerCase()
  const searching = normalizedQuery !== ""

  // FX5 (t-2026-10-12-32): the search text names every row in every locale,
  // 241 countries × 36 on globex, and only a typed query reads it. It is built
  // with the first letter, not in each render of the header on every page.
  const countrySearchTexts = useMemo(
    () =>
      searching ? countryOptions.map((o) => countrySearchText(o, locales)) : [],
    [searching, countryOptions, locales]
  )

  const languageSearchTexts = useMemo(
    () =>
      searching
        ? languageOptions.map((o) => languageSearchText(o, locales))
        : [],
    [searching, languageOptions, locales]
  )

  const filteredCountryOptions = useMemo(() => {
    const own = countryOptions.filter((o) => !awayCountries.has(o.country))
    if (!searching) return own
    return own.filter((o) =>
      countrySearchTexts[countryOptions.indexOf(o)].includes(normalizedQuery)
    )
  }, [searching, countryOptions, awayCountries, countrySearchTexts, normalizedQuery])

  const filteredRedirectOptions = useMemo(() => {
    if (!searching) return redirectOptions
    return redirectOptions.filter((o) =>
      `${o.label} ${o.country} ${o.host}`.toLowerCase().includes(normalizedQuery)
    )
  }, [searching, redirectOptions, normalizedQuery])

  const filteredLanguageOptions = useMemo(() => {
    if (!searching) return languageOptions
    return languageOptions.filter((_, i) =>
      languageSearchTexts[i].includes(normalizedQuery)
    )
  }, [searching, languageOptions, languageSearchTexts, normalizedQuery])

  const selectedCountryOption =
    countryOptions.find((o) => o.country === currentCountryCode) ??
    countryOptions[0]

  useEffect(() => {
    if (!open) return
    setPendingCountry(selectedCountryOption?.country)
    setPendingLocale(currentLocale)
    setQuery("")
  }, [open, selectedCountryOption?.country, currentLocale])

  if (!selectedCountryOption) {
    return null
  }

  const triggerFlagCode = selectedCountryOption.country.toUpperCase()

  /**
   * One header control: a button that opens the dialog, or — when there is
   * nothing to pick — the same face as plain text, named for a screen reader.
   */
  const trigger = ({
    testId,
    label,
    staticLabel,
    className,
    children,
  }: {
    testId: string
    label: string
    staticLabel: string
    className?: string
    children: React.ReactNode
  }) =>
    interactive ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        aria-label={label}
        className={className}
      >
        {children}
      </button>
    ) : (
      <span
        role="img"
        data-testid={testId}
        aria-label={staticLabel}
        className={clx(className, "pointer-events-none")}
      >
        {children}
      </span>
    )

  const countryLabel = `${t("tabCountry")}: ${selectedCountryOption.label}`

  function handleApply() {
    const countryChanged =
      !!pendingCountry && pendingCountry !== selectedCountryOption?.country
    const localeChanged = pendingLocale !== currentLocale

    const away = redirectOptions.find((o) => o.country === pendingCountry)
    if (away) {
      startTransition(() => {
        window.location.assign(away.url)
      })
      return
    }

    if (!countryChanged && !localeChanged) {
      setOpen(false)
      return
    }

    const segments = pathname.split("/").filter(Boolean)
    if (localeChanged) {
      segments[0] = pendingLocale
    }
    const newPath = "/" + segments.join("/")

    startTransition(async () => {
      if (localeChanged) {
        await updateLocale(pendingLocale)
      }
      if (countryChanged && pendingCountry) {
        // The switcher answers the first-visit region popup as well (t-2026-10-20-22).
        if (redirectOptions.length) {
          document.cookie = regionChoiceCookie(
            pendingCountry,
            window.location.protocol === "https:"
          )
        }
        await updateRegion(pendingCountry, newPath)
        return
      }
      setOpen(false)
      if (localeChanged) {
        router.push(newPath)
      }
    })
  }

  return (
    <>
      {/* Two controls, not one. The language and the delivery country are different
          choices, and a country flag glued to a language code reads as an error: a
          US flag beside "RU" in the header of every new shop (measured 2026-09-12).
          The language shows as its code alone; the country as its flag plus the
          currency the prices are in. Both open the same dialog, which has a section
          for each. */}
      {variant === "icons" ? (
        <span className={clx("flex items-center", className)}>
          {trigger({
            testId: "nav-country-select-button",
            label: countryLabel,
            staticLabel: countryLabel,
            className: ICON_CLASS,
            children: (
              <CountryFlag
                countryCode={triggerFlagCode}
                style={{ width: "15px", height: "15px" }}
                className="shrink-0 rounded-full"
              />
            ),
          })}
          <span
            aria-hidden
            className="h-3 w-px shrink-0 bg-transparent transition-colors duration-200 group-data-[scrolled=true]:bg-[var(--h7-divider,var(--border))]"
          />
          {trigger({
            testId: "nav-region-select-button",
            label: t("currencyLabel", { currencyCode: selectedCountryOption.currencyCode }),
            staticLabel: selectedCountryOption.currencyCode,
            className: ICON_CLASS,
            children: (
              <span className={SIGN_CLASS}>{selectedCountryOption.currencySymbol}</span>
            ),
          })}
        </span>
      ) : variant === "text" ? (
        <span className={clx("flex h-10 items-center rounded-[32px] transition-[background-color,box-shadow] duration-200 group-data-[scrolled=true]:bg-[var(--h7-surface,var(--background))] group-data-[scrolled=true]:shadow-buttons-neutral", className)}>
          {trigger({
            testId: "nav-country-select-button",
            label: t("tabCountry"),
            staticLabel: countryLabel,
            className: TEXT_CLASS,
            children: (
              <>
                <CountryFlag
                  countryCode={triggerFlagCode}
                  style={{ width: "15px", height: "15px" }}
                  className="shrink-0 rounded-full"
                />
                <span>{selectedCountryOption.label}</span>
              </>
            ),
          })}
          <span
            aria-hidden
            className="h-3 w-px shrink-0 bg-transparent transition-colors duration-200 group-data-[scrolled=true]:bg-[var(--h7-divider,var(--border))]"
          />
          {trigger({
            testId: "nav-region-select-button",
            label: t("currencyLabel", { currencyCode: selectedCountryOption.currencyCode }),
            staticLabel: selectedCountryOption.currencyCode,
            className: TEXT_CLASS,
            children: (
              <>
                <span aria-hidden className={SIGN_CLASS}>
                  {selectedCountryOption.currencySymbol}
                </span>
                <span>{selectedCountryOption.currencyCode}</span>
              </>
            ),
          })}
        </span>
      ) : (
      <span className={clx("flex items-center gap-x-3 text-ui-fg-subtle", className)}>
        {trigger({
          testId: "nav-region-select-button",
          label: t("tabLanguage"),
          staticLabel: `${t("tabLanguage")}: ${currentLocale.toUpperCase()}`,
          className: "flex items-center gap-x-1 hover:text-ui-fg-base transition-colors",
          children: (
            <>
              <span className="uppercase">{currentLocale}</span>
              {interactive && <ChevronDown className="shrink-0 w-2.5 h-2.5" />}
            </>
          ),
        })}
        {trigger({
          testId: "nav-country-select-button",
          label: t("tabCountry"),
          staticLabel: `${countryLabel}, ${selectedCountryOption.currencyCode}`,
          className: "flex items-center gap-x-1.5 hover:text-ui-fg-base transition-colors",
          children: (
            <>
              <CountryFlag
                countryCode={triggerFlagCode}
                style={{ width: "16px", height: "16px" }}
                className="shrink-0 rounded-sm"
              />
              <span>{selectedCountryOption.currencySymbol}</span>
              {interactive && <ChevronDown className="shrink-0 w-2.5 h-2.5" />}
            </>
          ),
        })}
      </span>
      )}

      {interactive && (
        <Transition show={open}>
          {/* Above the phone category menu (z-[70]), which hosts this control below 1024px. */}
          <Dialog onClose={() => setOpen(false)} className="relative z-[75]">
            <TransitionChild
              enter="ease-out duration-200"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-ui-bg-overlay" aria-hidden="true" />
            </TransitionChild>

            <div className="fixed inset-0 flex justify-end">
              <TransitionChild
                enter="ease-out duration-250"
                enterFrom="opacity-0 translate-x-8"
                enterTo="opacity-100 translate-x-0"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-x-0"
                leaveTo="opacity-0 translate-x-8"
              >
                <DialogPanel className="flex flex-col h-[calc(100%-16px)] w-[calc(100%-16px)] sm:w-1/3 2xl:w-1/4 sm:min-w-[360px] m-2 rounded-rounded bg-ui-bg-base p-6 gap-6">
                  <div className="flex items-center justify-between shrink-0">
                    <DialogTitle className="txt-xlarge text-ui-fg-base">
                      {canPickCountry ? t("title") : t("tabLanguage")}
                    </DialogTitle>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label={t("close")}
                      data-testid="close-region-select-button"
                      className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors p-0.5"
                    >
                      <XMark />
                    </button>
                  </div>

                  <Input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      canPickCountry ? t("placeholder") : t("placeholderLanguage")
                    }
                  />

                  <div className="flex flex-1 min-h-0 gap-6">
                    {canPickCountry && (
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="txt-compact-small-plus text-ui-fg-subtle shrink-0 mb-2">
                          {t("tabCountry")}
                        </span>
                        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden no-scrollbar">
                          <RadioGroup
                            dir={dir}
                            value={pendingCountry}
                            onValueChange={setPendingCountry}
                            disabled={isPending}
                            className="gap-1"
                          >
                            {filteredRedirectOptions.map((opt) => (
                              <RegionOptionRow
                                key={opt.country}
                                id={`region-country-${opt.country}`}
                                value={opt.country}
                                label={opt.label}
                                description={opt.host}
                                flagCode={opt.country.toUpperCase()}
                              />
                            ))}
                            {filteredCountryOptions.map((opt) => (
                              <RegionOptionRow
                                key={opt.country}
                                id={`region-country-${opt.country}`}
                                value={opt.country}
                                label={opt.label}
                                description={opt.currencyCode}
                                flagCode={opt.country.toUpperCase()}
                              />
                            ))}
                          </RadioGroup>
                        </div>
                      </div>
                    )}

                    {canPickCountry && canPickLanguage && (
                      <div className="w-px bg-ui-border-base shrink-0" />
                    )}

                    {canPickLanguage && (
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="txt-compact-small-plus text-ui-fg-subtle shrink-0 mb-2">
                          {t("tabLanguage")}
                        </span>
                        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden no-scrollbar">
                          <RadioGroup
                            dir={dir}
                            value={pendingLocale}
                            onValueChange={setPendingLocale}
                            disabled={isPending}
                            className="gap-1"
                          >
                            {filteredLanguageOptions.map((opt) => (
                              <RegionOptionRow
                                key={opt.code}
                                id={`region-language-${opt.code}`}
                                value={opt.code}
                                label={opt.label}
                                description={opt.description}
                              />
                            ))}
                          </RadioGroup>
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="large"
                    className="w-full shrink-0"
                    disabled={isPending}
                    isLoading={isPending}
                    onClick={handleApply}
                  >
                    {t("apply")}
                  </Button>
                </DialogPanel>
              </TransitionChild>
            </div>
          </Dialog>
        </Transition>
      )}
    </>
  )
}

export default RegionSelect
