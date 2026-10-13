/**
 * What `sbp-off-cherkashino-ru.ts` changes, as pure functions the unit suite runs
 * (t-2026-10-12-32). Ivan 12.10: «4.1. нужно выключить оплату СБП»; 13.10: «я просил в
 * upready-store убрать в магазине cherkashino.ru способ оплаты СБП, но он до сих пор там.»
 *
 * The shop's own pages still offered SBP on 13.10 (read on the live cherkashino.ru at 13:3x):
 * «О магазине», «Доставка и оплата» and the offer's 5.3. Each rule rewrites exactly that
 * wording and nothing near it. Markdown and spacing may differ from what the storefront shows,
 * so a rule matches the words, the list markers and the line breaks loosely, and a page whose
 * owner has since reworded it matches no rule and is left alone (the script logs it).
 */

/** The shop the order is about: its pages and its Robokassa account. */
export const SBP_OFF_HOST = "cherkashino.ru";

/** Robokassa's alias for SBP (`modules/payment-robokassa/payment-methods.ts`). */
export const SBP_ALIAS = "SBP";

/** The owner's switched-off list with SBP in it, in the order it had; `null` when SBP is already there. */
export const withSbpOff = (disabled: readonly string[]): string[] | null =>
  disabled.includes(SBP_ALIAS) ? null : [...disabled, SBP_ALIAS];

export type SbpPageRule = { key: string; pattern: RegExp; replacement: string };

// A list item's marker and the space after it, or nothing: `- `, `* `, `+ ` or `1. `.
const ITEM = String.raw`\s*(?:[-*+]|\d+[.)])?\s*`;

export const SBP_PAGE_RULES: readonly SbpPageRule[] = Object.freeze([
  {
    // «Цены в рублях, оплата на сайте картой или через СБП (Robokassa)»
    key: "about",
    pattern: /картой или через СБП \(Robokassa\)/,
    replacement: "картой (Robokassa)",
  },
  {
    // «Заказ оплачивается на сайте при оформлении, одним из способов:» + «банковской картой;» +
    // «через Систему быстрых платежей (СБП).»
    key: "delivery",
    pattern: new RegExp(
      String.raw`при оформлении, одним из способов:${ITEM}банковской картой;${ITEM}через Систему быстрых платежей \(СБП\)\.`,
    ),
    replacement: "при оформлении банковской картой.",
  },
  {
    // 5.3: «оплата банковской картой через платёжный сервис Robokassa;» + «оплата через Систему
    // быстрых платежей (СБП) через платёжный сервис Robokassa.» The offer's own 1.10 lets the
    // seller change it by publishing the new text on the site.
    key: "offer",
    pattern: new RegExp(
      String.raw`(оплата банковской картой через платёжный сервис Robokassa);${ITEM}оплата через Систему быстрых платежей \(СБП\) через платёжный сервис Robokassa\.`,
    ),
    replacement: "$1.",
  },
]);

export type SbpPageEdit =
  | { outcome: "changed"; body: string }
  | { outcome: "no-rule" | "already" | "different"; body: string };

/**
 * The page's body with SBP taken out by its rule. `already` when the body no longer mentions
 * SBP, `different` when it does in words the rule does not know (the owner's own text: left
 * for the owner), `no-rule` for a page key without one.
 */
export const sbpOffPageBody = (key: string, body: string): SbpPageEdit => {
  const rule = SBP_PAGE_RULES.find((candidate) => candidate.key === key);
  if (!rule) {
    return { outcome: "no-rule", body };
  }
  if (rule.pattern.test(body)) {
    return { outcome: "changed", body: body.replace(rule.pattern, rule.replacement) };
  }
  return { outcome: /СБП|быстрых платежей/i.test(body) ? "different" : "already", body };
};
