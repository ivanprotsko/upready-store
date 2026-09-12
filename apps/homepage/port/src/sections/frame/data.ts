// Verbatim copy from reference/rendered/06-frame.html — see NOTES.md.

// The "04" prefix is `{{ nFrame }}` in the raw template: a sequence number
// computed at render time from which optional blocks (proof/frame/included/
// pricing/faq) are currently toggled on (reference/dc-script.js:319-322).
// reference/rendered/06-frame.html was captured with all five blocks toggled
// on (scripts/capture-reference.mjs pass 1), which places "frame" 4th in the
// enabled order → "04". This component owns no cross-section state, so the
// number is copied verbatim from that capture. See NOTES.md "Needs from
// merger" for how the merger should wire this up for real.
export const eyebrowNumber = "04";
export const eyebrowLabel = "рамка";

export const heading = "Свой магазин — не замена Wildberries, а страховка";

export const paragraphPrimary =
  "Wildberries даёт трафик, который в одиночку не воспроизвести, и уходить " +
  "оттуда незачем. Свой магазин решает другую задачу: это канал, который " +
  "принадлежит вам.";

export const paragraphSecondary =
  "В спокойное время он приносит повторные продажи без комиссии площадки и " +
  "собирает базу покупателей, с которой можно работать напрямую. В " +
  "форс-мажор — это запасной выход, который у вас уже есть, а не тот, " +
  "который вы начинаете строить в панике.";

export const bullets = [
  "Свой магазин — второй канал и собственная база клиентов",
  "Каталог упакован и переносим: запуск на любой новой площадке — за дни, а не за месяц",
];

export const figureCaption = "Wildberries остаётся. Зависимость — нет.";

// Text content of the SVG diagram, verbatim. Geometry (coordinates, paths,
// dash arrays) stays inline in index.tsx — it is presentation, not copy.
export const diagram = {
  ariaLabel:
    "Схема: бизнес на одной опоре против бизнеса на нескольких опорах",
  nowLabel: "СЕЙЧАС",
  salesLabelLeft: "продажи",
  wbBoxLabel: "Wildberries",
  singlePointOfFailure: "одна точка отказа",
  planBLabel: "С ПЛАНОМ Б",
  salesLabelRight: "продажи",
  wbBoxLabel2: "Wildberries",
  mainTraffic: "основной трафик",
  ownShopLabel: "свой магазин",
  insuranceLabel: "страховка + повторные продажи",
  otherPlatformsLabel: "другие площадки",
  catalogAlreadyPortable: "каталог уже переносим",
  bottomLine: "Wildberries остаётся. Зависимость — нет.",
};
