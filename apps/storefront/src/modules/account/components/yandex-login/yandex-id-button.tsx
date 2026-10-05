"use client"

import { clx } from "@medusajs/ui"
import { useLocale, useTranslations } from "next-intl"

/**
 * The «Войти с Яндекс ID» button, as Yandex's own button constructor draws it
 * (autofill.yandex.ru/suggest/button/constructor, t-2026-10-04-45, Ivan 04.10: «Кнопку в попапе
 * авторизации взять из констурктора кнопок … Для светлой и темной версии разные. Высота 40,
 * скругления 8, ширина 320»). The constructor's settings: size `s` (40 px), view `main`, radius 8,
 * icon `ya` (`yaEng` outside Russian), theme `light` on the light site and `dark` on the dark one.
 * Its markup is copied here as it is: the logo, the text, the avatar circle, the padding 9/11, the
 * 14/16 YS Text at 500, black on light and white on dark. The saved originals are in the
 * t-2026-10-04-45 report (`constructor/`).
 *
 * Only the look is the constructor's. The button stays a plain LINK to
 * `/api/yandex-login?return=<the page the buyer is on>`, the server redirect to the Yandex consent
 * screen (`yandex-login/index.tsx`), not the SDK's suggest/token flow. This is the one place that
 * link is built, so the sign-in modal, `/account`, the cart sidebar and the checkout all draw the
 * same button.
 *
 * It fills the row it is given: the sign-in modal's content column is 320 wide (`CheckoutModal`
 * `compact`), so there it is Ivan's 320 × 40. The colours are Yandex's, not the shop's theme
 * tokens; the site's own light/dark switch (`data-mode`) picks the variant.
 */
export default function YandexIdButton({
  returnTo,
  className,
  "data-testid": testId,
}: {
  returnTo: string
  className?: string
  "data-testid"?: string
}) {
  const t = useTranslations("CartSidebar")
  const latin = useLocale() !== "ru"

  return (
    <a
      href={`/api/yandex-login?return=${encodeURIComponent(returnTo)}`}
      data-testid={testId}
      data-yandex-id-button=""
      className={clx(
        "relative box-border flex h-10 w-full min-w-[156px] items-center justify-between rounded-lg px-[11px] py-[9px]",
        "font-['YS_Text','Helvetica_Neue',Arial,sans-serif] text-[14px] leading-4",
        "transition-[opacity,background-color] duration-300 outline-none focus-visible:shadow-borders-focus",
        // Yandex's constructor colours, `main` view: black with white ink on a light site, white with
        // black ink on a dark one (`--yandex-id-*` in styles/globals.css, switched on [data-mode]).
        "bg-[var(--yandex-id-bg)] text-[var(--yandex-id-fg)]",
        className
      )}
    >
      <span aria-hidden className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
        {latin ? <YandexLogoLatin /> : <YandexLogo />}
      </span>
      <span className="ms-4 min-w-0 overflow-hidden font-medium">
        <span className="block truncate">{t("signInYandex")}</span>
      </span>
      <span
        aria-hidden
        // theme-colours allowlist: the constructor's own grey under its avatar placeholder.
        className="ms-4 box-border h-6 w-6 shrink-0 rounded-full border-[0.5px] border-[#767676] bg-[#767676] bg-[url('/images/yandex-id/avatar-placeholder.png')] bg-contain"
      />
    </a>
  )
}

/** The constructor's `ya` icon, its own 44 × 44 SVG as it ships it. */
const YandexLogo = () => (
  <svg viewBox="0 0 44 44" fill="none" className="h-full w-full">
    <rect width="44" height="44" fill="#FC3F1D" />
    <path
      d="M24.7407 33.9778H29.0889V9.04443H22.7592C16.3929 9.04443 13.0538 12.303 13.0538 17.1176C13.0538 21.2731 15.2187 23.6163 19.0532 26.1609L21.3832 27.6987L18.3927 25.1907L12.4667 33.9778H17.1818L23.5115 24.5317L21.3098 23.0671C18.6496 21.2731 17.3469 19.8818 17.3469 16.8613C17.3469 14.2068 19.2183 12.4128 22.7776 12.4128H24.7223V33.9778H24.7407Z"
      fill="white"
    />
  </svg>
)

/** The constructor's `yaEng` icon, for every locale but Russian. */
const YandexLogoLatin = () => (
  <svg viewBox="0 0 44 44" fill="none" className="h-full w-full">
    <rect width="44" height="44" fill="#FC3F1D" />
    <path
      d="M22.9515 24.2897C24.2907 27.223 24.737 28.2433 24.737 31.7665V36.4375H19.9544V28.5621L10.9313 8.9375H15.9211L22.9515 24.2897ZM28.8501 8.9375L22.9994 22.2332H27.8617L33.7284 8.9375H28.8501Z"
      fill="white"
    />
  </svg>
)
