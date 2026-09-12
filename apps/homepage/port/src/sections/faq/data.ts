// Copy extracted verbatim from reference/dc-script.js (`get faqData()`, ~line 157)
// and reference/rendered/13-faq.html. Order is frozen (DOM order of the accordion).

export interface FaqItem {
  /** question text, rendered inside the <h3> */
  question: string;
  /** answer text, rendered inside the <p> when the item is open */
  answer: string;
  /**
   * optional "todo" marker rendered as a small badge right after the answer
   * text, when non-empty. In dc-script.js this is gated by the page-level
   * prop `showTodoMarkers` (default true, see reference/props.json) — see
   * NOTES.md "Needs from merger".
   */
  todo?: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Вы предлагаете уйти с Wildberries?",
    answer:
      "Нет. Wildberries остаётся вашим основным каналом. Магазин — второй, параллельный, на случай, когда первый недоступен.",
  },
  {
    question: "На сайт же никто не придёт. Зачем он?",
    answer:
      "В первый месяц — почти никто, и это нормально. Задача магазина не в том, чтобы завтра заменить трафик Wildberries, а в том, чтобы он уже существовал, когда понадобится. Плюс он собирает базу покупателей, которым можно продавать повторно без комиссии площадки.",
  },
  {
    question: "Почему так дёшево?",
    answer:
      "Мы не проектируем магазин с нуля. Мы разворачиваем готовое проверенное решение и настраиваем его под вас — вы платите за настройку и запуск, а не за разработку.",
  },
  {
    question: "У меня уже есть сайт, но он не работает.",
    answer: "Напишите — посмотрим, что чинить. Часто починить дешевле, чем ставить заново.",
  },
  {
    question: "Кому принадлежит магазин?",
    answer:
      "Вам. Домен, данные, каталог и база покупателей — ваши. Вы в любой момент можете забрать всё и работать с другим подрядчиком.",
  },
  {
    question: "А если мне не понравится?",
    answer:
      "Если сомневаетесь — начните с установки за 4 900 ₽, а оформление добавим позже, когда магазин уже будет работать. Условия возврата — в блоке «Цены».",
  },
  {
    question: "Как оплатить?",
    answer: "",
    todo: "todo: payment_methods_answer",
  },
];

/**
 * Snapshot of the eyebrow number ("{{ nFaq }} · вопросы") as it renders in
 * reference/rendered/13-faq.html with the current, all-blocks-visible props.
 * The real value is computed page-wide in dc-script.js (`renderVals`, the
 * `order`/`num` bookkeeping around line 319) from which optional blocks are
 * switched on — see NOTES.md "Needs from merger".
 */
export const EYEBROW_NUMBER = "11";

/**
 * `showTodoMarkers` page-level prop (reference/props.json, default true).
 * Gates the small orange "todo" badge after an answer. No control for it
 * lives inside the FAQ section itself in dc-script.js.
 */
export const SHOW_TODO_MARKERS = true;

/** faqOpen initial state in dc-script.js (`state = { …, faqOpen: 0, … }`) */
export const DEFAULT_OPEN_INDEX = 0;
