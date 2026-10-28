"use client"

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Description,
} from "@headlessui/react"
import { XMark } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { useState, useTransition } from "react"

import { updateRegion } from "@lib/data/cart"
import {
  REGION_CHOICE_DISMISSED,
  REGION_CHOICE_OTHER,
  regionChoiceCookie,
  type RegionRedirect,
} from "@lib/tenant/region-redirects"
import CountryFlag from "@modules/common/components/country-flag"
import { regionNameOf } from "@modules/layout/components/region-select/options"

type RegionPopupProps = {
  redirects: RegionRedirect[]
  /** The countries to stay with, Kazakhstan first (`popupCountriesOf`). */
  countries: string[]
  /** Every country the shop's regions price in; a pick among them also switches the prices. */
  served: string[]
  currentCountry: string | null
}

const ROW_CLASS =
  "flex w-full items-center gap-x-3 rounded-lg border border-ui-border-base bg-ui-bg-base px-4 py-3 text-start transition-colors hover:bg-ui-bg-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"

/** Writes the answer in the browser, so the popup is gone before the server hears of it. */
const remember = (choice: string) => {
  document.cookie = regionChoiceCookie(
    choice,
    window.location.protocol === "https:"
  )
}

/**
 * The first-visit region question (t-2026-10-20-22). Ivan, 20.10.2026: «нужно сделать
 * попап с выбором региона и если человек выбирает "россия", то пусть выполняется
 * переадресация на сайт cherkashino.ru».
 *
 * A country that belongs to another shop sends the visitor to that shop's home and is
 * not remembered, so a return to this shop asks again. Any other answer stays here and
 * is remembered for a year; a country of this shop also switches the prices to it. Esc,
 * the close button and a click outside keep the visitor here for this visit only. The
 * answer can be changed later in the header's region switcher, which lists the same
 * redirect rows.
 */
const RegionPopup = ({
  redirects,
  countries,
  served,
  currentCountry,
}: RegionPopupProps) => {
  const t = useTranslations("RegionPopup")
  const tRegion = useTranslations("RegionSelect")
  const locale = useLocale()
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const [isPending, startTransition] = useTransition()

  const close = () => {
    remember(REGION_CHOICE_DISMISSED)
    setOpen(false)
  }

  const goAway = (redirect: RegionRedirect) => {
    startTransition(() => {
      window.location.assign(redirect.url)
    })
  }

  const stay = (country: string) => {
    remember(country)
    if (!served.includes(country) || country === currentCountry) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      await updateRegion(country, pathname)
    })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      className="relative z-[80]"
      data-testid="region-popup"
    >
      <div className="fixed inset-0 bg-ui-bg-overlay" aria-hidden="true" />
      <div className="fixed inset-0 flex items-end justify-center p-2 sm:items-center sm:p-4">
        <DialogPanel className="flex w-full max-w-[420px] flex-col gap-y-5 rounded-rounded bg-ui-bg-base p-6 shadow-elevation-modal">
          <div className="flex items-start justify-between gap-x-4">
            <div className="flex flex-col gap-y-1">
              <DialogTitle className="txt-xlarge text-ui-fg-base">
                {t("title")}
              </DialogTitle>
              <Description className="txt-small text-ui-fg-subtle">
                {t("description")}
              </Description>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={tRegion("close")}
              data-testid="region-popup-close"
              className="shrink-0 rounded-full p-0.5 text-ui-fg-subtle transition-colors hover:text-ui-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <XMark />
            </button>
          </div>

          <ul className="flex flex-col gap-y-2">
            {redirects.map((redirect) => (
              <li key={redirect.country}>
                <button
                  type="button"
                  className={ROW_CLASS}
                  disabled={isPending}
                  onClick={() => goAway(redirect)}
                  data-testid={`region-popup-${redirect.country}`}
                >
                  <CountryFlag
                    countryCode={redirect.country.toUpperCase()}
                    style={{ width: "20px", height: "20px" }}
                    className="shrink-0 rounded-sm"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="txt-compact-medium-plus text-ui-fg-base">
                      {regionNameOf(redirect.country, locale)}
                    </span>
                    <span className="txt-compact-small text-ui-fg-subtle">
                      {t("goesTo", { site: new URL(redirect.url).host })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {countries.map((country) => (
              <li key={country}>
                <button
                  type="button"
                  className={ROW_CLASS}
                  disabled={isPending}
                  onClick={() => stay(country)}
                  data-testid={`region-popup-${country}`}
                >
                  <CountryFlag
                    countryCode={country.toUpperCase()}
                    style={{ width: "20px", height: "20px" }}
                    className="shrink-0 rounded-sm"
                  />
                  <span className="txt-compact-medium-plus text-ui-fg-base">
                    {regionNameOf(country, locale)}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={clx(ROW_CLASS, "justify-center")}
                disabled={isPending}
                onClick={() => stay(REGION_CHOICE_OTHER)}
                data-testid="region-popup-other"
              >
                <span className="txt-compact-medium-plus text-ui-fg-base">
                  {t("otherCountry")}
                </span>
              </button>
            </li>
          </ul>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export default RegionPopup
