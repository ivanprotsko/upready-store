/**
 * Copy and links for the shell section (nav + footer), extracted verbatim
 * from reference/rendered/00-shell.html (rendered DOM = source of truth)
 * and reference/raw/00-shell.html (for the `sc-if`-gated nav links and the
 * `style-hover` values, which the rendered snapshot does not carry).
 */

export interface NavLink {
  href: string;
  label: string;
}

/** Always-visible nav links, in DOM order, between the spacer and the
 * conditional "Вопросы" link / the contact button. */
export const MAIN_NAV_LINKS: NavLink[] = [
  { href: "#sec-payments", label: "Оплата" },
  { href: "#sec-tariffs", label: "Тарифы" },
  { href: "#sec-delivery", label: "Доставка" },
  { href: "#sec-showcase", label: "Примеры" },
];

/**
 * Links gated by `sc-if value="{{ showIncluded/showPricing/showFaq }}"` in
 * reference/raw/00-shell.html. Those three flags come from dc-script.js
 * `state.blocks.{included,pricing,faq}` (`showIncluded: b.included`, etc.),
 * a page-wide admin toggle initialised to `false` — which is why none of
 * the three appear in reference/rendered/00-shell.html. Not owned by this
 * folder (see NOTES.md "Needs from merger"); Nav takes them as optional
 * props defaulting to that same `false` so the isolated harness matches
 * the reference exactly.
 */
export const INCLUDED_LINK: NavLink = { href: "#sec-included", label: "Состав" };
export const PRICING_LINK: NavLink = { href: "#sec-pricing", label: "Цены" };
export const FAQ_LINK: NavLink = { href: "#sec-faq", label: "Вопросы" };

/** Telegram contact link/button, reused (with different sizing) in both
 * the nav and the footer. Static — `href`/`target`/`rel` never change. */
export const CONTACT_LINK: NavLink & { target: string; rel: string } = {
  href: "https://t.me/vladupready",
  label: "Связаться",
  target: "_blank",
  rel: "noopener",
};

/** Footer copy — entirely static in both raw and rendered (no `sc-if`,
 * no dc-script.js reference to "footer"): this section has no known
 * interactive behaviour, including the `display:none` that hides it. */
export const FOOTER_BRAND = "upready";

export const FOOTER_LEGAL_PREFIX = "Реквизиты продавца ";
export const FOOTER_LEGAL_TODO = "todo: legal_requisites";

export interface FooterLink {
  label: string;
  todo: string;
}

export const FOOTER_LINKS: FooterLink[] = [
  { label: "Публичная оферта", todo: "todo: url_offer" },
  { label: "Политика обработки персональных данных", todo: "todo: url_privacy" },
];

export const FOOTER_COOKIE_PREFIX = "Cookie-уведомление ";
export const FOOTER_COOKIE_TODO = "todo: cookie_notice";

export const FOOTER_DOC_STAMP =
  "doc-upready-planb-v2-ru · rev 1 · status draft · 10 открытых todo — страницу нельзя публиковать";
