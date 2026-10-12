import type { BlockEntry } from "../../types"

import CountdownTimer from "."
import {
  DAYS_LABEL,
  DEADLINE_LABEL,
  HOURS_LABEL,
  MINUTES_LABEL,
  SECONDS_LABEL,
  parseCountdownTimerProps,
  type CountdownTimerProps,
} from "./props"

const units = {
  daysLabel: DAYS_LABEL,
  hoursLabel: HOURS_LABEL,
  minutesLabel: MINUTES_LABEL,
  secondsLabel: SECONDS_LABEL,
  deadlineLabel: DEADLINE_LABEL,
}

/**
 * The registry entry of `countdown/timer`: `docs/templates/BLOCK-CONTRACT.md` §1. The fixtures are fixed
 * moments, so the shots and the export repeat: the sample runs to the end of November 2026 and shows its
 * message after that, the empty one ended on 1 January 2026 and hides.
 */
export const timer: BlockEntry<CountdownTimerProps> = {
  id: "countdown/timer",
  category: "countdown",
  variant: "timer",
  title: "Countdown timer",
  roles: ["heading", "countdown", "description", "cta-primary"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: CountdownTimer,
  parseProps: parseCountdownTimerProps,
  fixtures: {
    empty: {
      endsAt: "2026-01-01T00:00:00+03:00",
      heading: { ru: "Новогодняя распродажа", en: "New Year sale" },
      text: {},
      button: null,
      afterEnd: "hide",
      style: "block",
      ...units,
    },
    sample: {
      endsAt: "2026-11-30T23:59:00+03:00",
      heading: { ru: "Чёрная пятница: чугун на 30\u00a0% дешевле", en: "Black Friday: cast iron 30% off" },
      text: {
        ru: "Сотейники, сковороды и жаровни по цене до конца ноября. По России — от\u00a02 до\u00a07\u00a0дней.",
        en: "Braisers, skillets and pots at sale prices until the end of November. 2 to 7 days across Russia.",
      },
      button: { label: { ru: "Смотреть посуду", en: "Shop cookware" }, href: "/categories/cookware" },
      afterEnd: {
        message: { ru: "Чёрная пятница закончилась. Спасибо, что были с нами", en: "Black Friday is over. Thank you for shopping with us" },
      },
      style: "block",
      ...units,
    },
  },
}
