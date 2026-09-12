// Copy verbatim from reference/rendered/11-delivery.html, cross-checked against
// reference/dc-script.js `get deliveryData()` (lines 198-224) for the values behind the
// `{{ d.* }}` expressions in reference/raw/11-delivery.html.

export const sectionLabel = "Доставка";

/**
 * `nDelivery` from dc-script.js `renderVals()` (lines 319-322): page-level section numbering
 * computed over which top-level blocks are switched on. Not something this isolated section
 * computes on its own (§3 item 1 keeps sections isolated) — the rendered HTML already gives the
 * ground-truth value for the default flag state ("09"), same convention as `nOps`/`nLogos` in
 * sibling sections (operations, social-proof).
 */
export const kickerNumber = "09";
export const kickerText = "доставка";

export const heading = "Доставка подключена";

export const intro =
  "Интегрируем магазин со службами доставки — покупатель видит актуальную стоимость доставки прямо при оформлении заказа, а вы печатаете готовые ярлыки для отправлений в один клик.";

export const serviceCountLabel = "11 служб";

export interface DeliveryItem {
  name: string;
  kind: string;
  /** present only for items with a raster/vector brand logo (`d.hasLogo`) */
  logo?: string;
  logoW?: string;
  logoH?: string;
  /** present only for items without a logo (`d.noLogo`) — two SVG path `d` attributes */
  iconD1?: string;
  iconD2?: string;
}

export const deliveryItems: DeliveryItem[] = [
  {
    name: "СДЭК",
    kind: "пвз · курьер",
    logo: "/images/logos/cdek.png",
    logoW: "57px",
    logoH: "16px",
  },
  {
    name: "Почта России",
    kind: "отделения · курьер",
    logo: "/images/logos/pochta-rossii.svg",
    logoW: "45px",
    logoH: "22px",
  },
  {
    name: "Яндекс Доставка",
    kind: "курьер за 2 часа",
    logo: "/images/logos/yandex-delivery.png",
    logoW: "68px",
    logoH: "22px",
  },
  {
    name: "5Post",
    kind: "постаматы пятёрочки",
    logo: "/images/logos/5post.svg",
    logoW: "44px",
    logoH: "19px",
  },
  {
    name: "Достависта",
    kind: "день в день",
    logo: "/images/logos/dostavista.svg",
    logoW: "80px",
    logoH: "12px",
  },
  {
    name: "DPD",
    kind: "курьер по рф",
    logo: "/images/logos/dpd-trim.svg",
    logoW: "50px",
    logoH: "22px",
  },
  {
    name: "Озон Доставка",
    kind: "пвз · постаматы",
    iconD1: "M12 2.5s5 3 5 9c0 3-2 6-5 10.5-3-4.5-5-7.5-5-10.5 0-6 5-9 5-9z",
    iconD2: "M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  },
  {
    name: "ПЭК",
    kind: "сборные грузы",
    iconD1: "M8.5 3h7v7h-7z",
    iconD2: "M3 13.5h8v7.5H3zM13 13.5h8v7.5h-8z",
  },
  {
    name: "Деловые Линии",
    kind: "фуры · паллеты",
    iconD1: "M3 5h18v9H3z",
    iconD2: "M3 17h18M6 17v3M18 17v3",
  },
  {
    name: "СберЛогистика",
    kind: "пвз · курьер",
    iconD1: "M12 3 4 7.5v9L12 21l8-4.5v-9z",
    iconD2: "M4 7.5 12 12l8-4.5M12 12v9",
  },
  {
    name: "Самовывоз",
    kind: "ваш адрес",
    iconD1: "M4.5 9.5h15V20h-15z",
    iconD2: "M3 9.5 5 4.5h14l2 5M9.5 20v-6h5v6",
  },
];
