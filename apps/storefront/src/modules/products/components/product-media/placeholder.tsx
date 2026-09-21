import { useTranslations } from "next-intl"

/**
 * What a product without photos shows inside its frame: a quiet mark and the words
 * "photo coming soon" in the visitor's language. It fills the frame it is given and never
 * sets a size of its own, so the card it sits in is exactly as tall as its neighbours.
 *
 * `useTranslations` rather than `getTranslations`: the frame is rendered from server
 * components (cards) and from client ones (cart lines, the gallery) alike.
 */
export default function ProductMediaPlaceholder({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("ProductMedia")

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-ui-fg-muted"
      data-testid="product-media-placeholder"
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={compact ? "size-6" : "size-10 small:size-12"}
      >
        <rect x="7" y="9" width="34" height="30" rx="4" />
        <circle cx="18" cy="20" r="3" />
        <path d="M7 33l9.5-9.5a2 2 0 0 1 2.8 0L27 31l3.7-3.7a2 2 0 0 1 2.8 0L41 35" />
      </svg>
      <span className={compact ? "sr-only" : "text-[13px] leading-snug small:text-sm"}>
        {t("photoSoon")}
      </span>
    </div>
  )
}
