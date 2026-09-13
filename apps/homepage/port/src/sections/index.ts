import type { ComponentType, ReactNode } from "react";

import Shell from "./shell/index";
import Hero from "./hero/index";
import Words from "./words/index";
import Why from "./why/index";
import How from "./how/index";
import Showcase from "./showcase/index";
import Tariffs from "./tariffs/index";
import Faq from "./faq/index";
import FinalCta from "./final-cta/index";

/**
 * Реестр секций — канон КОДА: какие блоки существуют и каков их порядок по
 * умолчанию. Порядок заморожен концепцией
 * `artifacts/docs/2026-09-13-homepage-concept.md` §2 (восемь блоков вместо
 * шестнадцати). Раскладку поверх реестра держит `public/homepage.cfg.json`
 * (см. src/config/layout.ts).
 */

/**
 * Что секция может получить от App.tsx.
 *
 * `num` — сквозной номер блока на странице. Ни одна секция нынешней вёрстки
 * номера не печатает, но счётчик оставлен рабочим: он понадобится, как только
 * вернётся блок с надзаголовком «01 · Название».
 */
export interface SectionProps {
  num?: string;
  children?: ReactNode;
}

export interface SectionEntry {
  /** slug = имя папки под src/sections/ и ключ в конфиге раскладки */
  slug: string;
  /** Человеческая подпись для панели режима редактирования */
  label: string;
  /** DOM-id секции, если на неё есть якорь */
  id?: string;
  /** default export из ./<slug>/index.tsx */
  Component: ComponentType<SectionProps>;
}

export const sections: SectionEntry[] = [
  { slug: "shell", label: "Шапка и подвал", Component: Shell },
  { slug: "hero", label: "Первый экран", id: "hero", Component: Hero },
  { slug: "words", label: "Три слова на деле", id: "sec-words", Component: Words },
  { slug: "why", label: "Почему сейчас", id: "sec-why", Component: Why },
  { slug: "how", label: "Как это работает", id: "sec-how", Component: How },
  { slug: "showcase", label: "Примеры магазинов", id: "sec-showcase", Component: Showcase },
  { slug: "tariffs", label: "Тарифы", id: "sec-tariffs", Component: Tariffs },
  { slug: "faq", label: "Вопросы", id: "sec-faq", Component: Faq },
  { slug: "final-cta", label: "Финальный призыв", id: "start", Component: FinalCta },
];
