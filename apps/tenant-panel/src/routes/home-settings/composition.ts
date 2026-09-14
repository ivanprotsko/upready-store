// tenant-panel: own file, no Admin counterpart. The vocabulary of the home-page
// document `upready.tenant-home/v1` (docs/tenant-panel/api-contract.md, "Piece
// 8"), transcribed by hand for the panel the same way the backend transcribes it
// in `api/store/storefront-settings/validation.ts` and the storefront in
// `lib/theme/composition.ts`: pnpm-workspace.yaml lists only `apps/**`, so there
// is no shared package the three could import one copy from.
//
// Sources of each half:
//  - the six composition enums and the FORBIDDEN pairs: the storefront's
//    `src/lib/theme/composition.ts`;
//  - the plain-language English label and the one-line "why" under each option:
//    the storefront's own catalog `apps/storefront/messages/en.json`, namespace
//    `Composition` (the English column of the C1 string set the composition
//    mockup §C1 specifies). Raw enum values never reach the screen (rule 18e);
//  - the theme preset labels: `THEME_LABELS` in the storefront's generated
//    `src/lib/theme/presets.generated.ts`.

export type Mode = "light" | "dark"
export type HeaderKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
export type HeroKey = "none" | "g" | "h" | "j" | "k" | "l" | "m" | "ga" | "gb"
export type TilesKey = "on" | "off"
export type ListingKey = "none" | "p1" | "p2" | "p3" | "p4" | "p5"
export type FooterKey = "none" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"

export type StorefrontSettingsInput = {
  defaultMode: Mode
  header: HeaderKey
  hero: HeroKey
  tiles: TilesKey
  listing: ListingKey
  footer: FooterKey
}

/** `THEME_IDS` of the storefront's generated presets file. */
export const THEME_PRESETS = [
  "medusa",
  "electronics",
  "geist",
  "home-goods",
  "sneakers",
  "supplements",
  "womens-fashion",
] as const

export type ThemePreset = (typeof THEME_PRESETS)[number]

/** `THEME_LABELS`, verbatim. An id never reaches the screen. */
export const THEME_LABELS: Record<ThemePreset, string> = {
  medusa: "Medusa default",
  electronics: "Ferrite",
  geist: "Geist",
  "home-goods": "Long Morning",
  sneakers: "Kerbstone",
  supplements: "Scruple",
  "womens-fashion": "Larchant",
}

export type Option<T extends string> = {
  value: T
  /** What the operator reads in the select. */
  label: string
  /** The one-line description under it — `Composition.<slot>Why.<key>`. */
  why: string
}

export const MODE_OPTIONS: Option<Mode>[] = [
  {
    value: "light",
    label: "Светлая",
    why: "Посетитель, который ничего не переключал, видит светлую палитру.",
  },
  {
    value: "dark",
    label: "Тёмная",
    why: "Посетитель, который ничего не переключал, видит тёмную палитру.",
  },
]

export const HEADER_OPTIONS: Option<HeaderKey>[] = [
  {
    value: "h1",
    label: "Как сейчас",
    why: "Бургер-меню слева, логотип по центру, поиск, регион, аккаунт и корзина справа.",
  },
  {
    value: "h2",
    label: "Слева, меню в строку",
    why: "Логотип слева, до четырёх ссылок на категории по центру, утилиты справа.",
  },
  {
    value: "h3",
    label: "Два яруса",
    why: "Узкая промо-строка над основной строкой с логотипом, меню и поиском.",
  },
  {
    value: "h4",
    label: "Акцент",
    why: "Шапка заливается акцентным цветом, логотип слева, меню по центру.",
  },
  {
    value: "h5",
    label: "Узкая + лента категорий",
    why: "Узкая полоса и прокручиваемый ряд чипов категорий с числом товаров.",
  },
  {
    value: "h6",
    label: "По центру + лента категорий",
    why: "Тот же ряд чипов категорий, что и в «Узкой», но логотип остаётся по центру.",
  },
]

export const HERO_OPTIONS: Option<HeroKey>[] = [
  {
    value: "none",
    label: "Нет",
    why: "Без хиро — страница сразу открывается следующим разделом.",
  },
  {
    value: "g",
    label: "Витрина",
    why: "Разделённый хиро: фото товара рядом с названием, ценой и кнопкой добавления в корзину.",
  },
  {
    value: "h",
    label: "Полка",
    why: "Полка из трёх товаров рядом с панелью, называющей коллекцию и стартовую цену.",
  },
  {
    value: "j",
    label: "Три двери",
    why: "Три крупные плитки категорий с числом товаров вместо хиро-изображения.",
  },
  {
    value: "k",
    label: "Анонс",
    why: "Плоская акцентная полоса с заголовком, подзаголовком и одним призывом к действию.",
  },
  {
    value: "l",
    label: "В движении",
    why: "Фото на всю ширину с плавающей карточкой одного товара в левом нижнем углу.",
  },
  {
    value: "m",
    label: "Без хиро, только текст",
    why: "Без изображения — двухстрочный слоган над заголовком первой коллекции.",
  },
  {
    value: "ga",
    label: "Карусель с соседями",
    why: "Карусель слайдов категорий: активный слайд шире, соседние видны по краям.",
  },
  {
    value: "gb",
    label: "Полосы",
    why: "Вертикальные полосы категорий; выбранная полоса разворачивается со своим текстом.",
  },
]

export const TILES_OPTIONS: Option<TilesKey>[] = [
  {
    value: "on",
    label: "Вкл",
    why: "A row of category tiles under the hero.",
  },
  {
    value: "off",
    label: "Выкл",
    why: "No category tiles on the home page.",
  },
]

export const LISTING_OPTIONS: Option<ListingKey>[] = [
  {
    value: "none",
    label: "Нет",
    why: "Без списка товаров — страница заканчивается после хиро и плиток.",
  },
  {
    value: "p1",
    label: "Сетка из 4",
    why: "Одна коллекция, четыре колонки, восемь товаров, показаны название и цена.",
  },
  {
    value: "p2",
    label: "Плотная 6",
    why: "Все товары, шесть колонок, плотная сетка из двенадцати, только название и цена.",
  },
  {
    value: "p3",
    label: "Список с характеристиками",
    why: "Список строками: изображение, название, строка характеристик и цена для каждого товара.",
  },
  {
    value: "p4",
    label: "Стена",
    why: "Трёхколоночная стена-мозаика из девяти товаров: изображение, название и цена.",
  },
  {
    value: "p5",
    label: "Редакционная",
    why: "Один крупный товар и четыре меньших рядом, редакционная вёрстка.",
  },
]

export const FOOTER_OPTIONS: Option<FooterKey>[] = [
  {
    value: "none",
    label: "Нет",
    why: "Без подвала.",
  },
  {
    value: "f1",
    label: "Четыре колонки",
    why: "Четыре колонки: бренд, категории, коллекции и информационные ссылки.",
  },
  {
    value: "f2",
    label: "Одна строка",
    why: "Одна строка: логотип и все ссылки в ряд, юридическая строка снизу.",
  },
  {
    value: "f3",
    label: "Огромный логотип",
    why: "Ряды ссылок над огромным логотипом на всю ширину.",
  },
  {
    value: "f4",
    label: "Инвертированный, с рассылкой",
    why: "Инвертированные цвета: форма рассылки рядом с категориями и коллекциями.",
  },
  {
    value: "f5",
    label: "Условия плитками",
    why: "Три карточки с фактами над обычными колонками.",
  },
  {
    value: "f6",
    label: "Инвертированный огромный логотип",
    why: "Ряды ссылок над инвертированным огромным логотипом.",
  },
]

export type ForbiddenRule = {
  field: keyof StorefrontSettingsInput
  value: string
  against: keyof StorefrontSettingsInput
  againstValue: string
  reason: string
}

/** The storefront's `FORBIDDEN`, verbatim. The backend re-checks both pairs and
 *  answers 422; the screen greys the option here so a save is never attempted. */
export const FORBIDDEN: readonly ForbiddenRule[] = [
  {
    field: "header",
    value: "h4",
    against: "hero",
    againstValue: "k",
    reason:
      "Header Accent and hero Announcement both fill their bar with the accent, nothing between.",
  },
  {
    field: "footer",
    value: "f6",
    against: "defaultMode",
    againstValue: "dark",
    reason:
      "Footer Inverted giant wordmark turns light on a dark page — reads as detached, not a foundation.",
  },
]

/**
 * Why picking `value` for `field` is blocked right now, given the rest of the
 * document — the reason the select shows beside the greyed option. Both
 * directions of every pair are covered: choosing footer f6 while the mode is
 * dark is blocked, and so is choosing dark while the footer is f6.
 */
export const blockedReason = (
  settings: StorefrontSettingsInput,
  field: keyof StorefrontSettingsInput,
  value: string
): string | null => {
  for (const rule of FORBIDDEN) {
    if (rule.field === field && rule.value === value && settings[rule.against] === rule.againstValue) {
      return rule.reason
    }
    if (rule.against === field && rule.againstValue === value && settings[rule.field] === rule.value) {
      return rule.reason
    }
  }
  return null
}

export const HOME_BLOCKS = ["hero", "categories", "products"] as const
export type HomeBlock = (typeof HOME_BLOCKS)[number]

export const BLOCK_LABELS: Record<HomeBlock, string> = {
  hero: "Hero",
  categories: "Category tiles",
  products: "Products",
}

export type TenantHomeContent = {
  hero: {
    title: string
    subtitle: string
    cta_label: string
    cta_href: string
    image_url: string | null
  }
  products:
    | { source: "popular" }
    | { source: "category"; category_id: string; title: string }
  order: HomeBlock[]
}

export type TenantHomeDocument = {
  schema?: string
  theme: { preset: ThemePreset }
  settings: StorefrontSettingsInput
  content: TenantHomeContent
  updatedAt?: string
}

/**
 * What the screen shows a tenant that never saved a document. The composition
 * half repeats the storefront's own "no saved settings" baseline (`DEFAULT_HEADER`
 * h1, `DEFAULT_HERO` k, `DEFAULT_TILES` on, `DEFAULT_LISTING` p1, `DEFAULT_FOOTER`
 * f1 in the storefront's `nav/variants`, `home/variants` and `footer/variants`),
 * so saving the form unchanged leaves the storefront looking exactly as it did.
 */
export const DEFAULT_DOCUMENT: TenantHomeDocument = {
  theme: { preset: "medusa" },
  settings: {
    defaultMode: "light",
    header: "h1",
    hero: "k",
    tiles: "on",
    listing: "p1",
    footer: "f1",
  },
  content: {
    hero: { title: "", subtitle: "", cta_label: "", cta_href: "", image_url: null },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
}
