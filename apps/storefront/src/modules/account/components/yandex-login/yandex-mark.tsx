/**
 * The Yandex mark on the sign-in control.
 *
 * Yandex asks for its own logo and colour on this button, which makes it the
 * one place this storefront paints a hex value instead of a `@medusajs/ui`
 * token. The square below is a stand-in in the store's own shape; replacing it
 * with the official asset is a design step on its own, recorded in
 * `docs/auth-yandex.md`, and it lives in its own file so that swap touches
 * nothing else.
 */
const YandexMark = () => (
  <span
    aria-hidden
    // theme-colours allowlist: Yandex's own brand red, white ink fixed on it by Yandex's own brand guideline — not a theme surface.
    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#FC3F1D] text-[13px] font-semibold leading-none text-white"
  >
    Я
  </span>
)

export default YandexMark
