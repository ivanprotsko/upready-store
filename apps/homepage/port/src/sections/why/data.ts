// «Почему сейчас» — три проверенных факта о маркетплейсах.
// Копирайт и сноски дословно: концепция §3 «Почему сейчас», прототип строки
// 329-341. Первоисточники — отчёт `market-facts-and-competitors.md`, сырьё в
// `research/raw/2026-09-13-marketplace-dependency-facts/`.

export const EYEBROW = "Почему сейчас";

export const HEADING = "Маркетплейс меняет правила за вас";

export interface Fact {
  /** Число факта — моно, табличные цифры. */
  number: string;
  /** Номер сноски. */
  note: string;
  text: string;
}

export const FACTS: Fact[] = [
  {
    number: "12",
    note: "1",
    text: "раз за первое полугодие 2026 года менялась оферта продавца Wildberries.",
  },
  {
    number: "95,6 %",
    note: "2",
    text: "опрошенных продавцов Wildberries не получили выплату в срок — около 20 млрд ₽ за одну неделю продаж.",
  },
  {
    number: "13,6 %",
    note: "3",
    text: "продавцов Wildberries имеют хоть какие-то продажи в топ-500 ниш — год назад было 20,3 %.",
  },
];

export const CLOSING =
  "Свой магазин — единственный канал продаж, который остаётся вашим при любом сценарии.";

export const CTA_LABEL = "Создать магазин";

export interface Source {
  /** Текст до ссылки, вместе с номером сноски и датой. */
  prefix: string;
  href: string;
  label: string;
}

export const SOURCES: Source[] = [
  {
    prefix: "¹ CNews, 01.07.2026 — ",
    href: "https://www.cnews.ru/news/top/2026-07-01_eto_vashi_problemywildberries",
    label: "cnews.ru",
  },
  {
    prefix: "² Коммерсантъ, 03.09.2026 — ",
    href: "https://www.kommersant.ru/doc/8938421",
    label: "kommersant.ru",
  },
  {
    prefix: "³ CNews по данным Forbes и MPSTATS, 22.05.2026 — ",
    href: "https://www.cnews.ru/news/top/2026-05-22_zarabatyvat_na_wildberries_stalo",
    label: "cnews.ru",
  },
];

/** Разделитель между сносками в одной строке. */
export const SOURCE_SEPARATOR = " · ";
