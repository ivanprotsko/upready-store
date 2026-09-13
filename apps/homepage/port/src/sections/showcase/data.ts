// «Примеры» — пять живых витрин на том же движке.
// Копирайт дословно: концепция §3 «Примеры», прототип строки 355-364.
// Скриншоты лежат в `public/showcase/<slug>.jpg`.

export const EYEBROW = "Примеры";

export const HEADING = "Пять витрин на том же движке";

export const SUB = "Разные тема, шрифты и фотография — движок один. Откройте любую.";

export interface ShowcaseCard {
  /** Имя файла скриншота в public/showcase. */
  slug: string;
  category: string;
  title: string;
  url: string;
}

export const CARDS: ShowcaseCard[] = [
  {
    slug: "electronics",
    category: "Электроника",
    title: "Магазин наушников",
    url: "https://ferrite.upready.dev/",
  },
  {
    slug: "fashion",
    category: "Одежда",
    title: "Магазин одежды",
    url: "https://larchant.upready.dev/",
  },
  {
    slug: "home",
    category: "Дом",
    title: "Товары для дома",
    url: "https://long-morning.upready.dev/",
  },
  {
    slug: "supplements",
    category: "БАД",
    title: "Магазин добавок",
    url: "https://scruple.upready.dev/",
  },
  {
    slug: "sneakers",
    category: "Обувь",
    title: "Магазин кроссовок",
    url: "https://kerbstone.upready.dev/",
  },
];

export const shotUrl = (slug: string): string => `/showcase/${slug}.jpg`;
