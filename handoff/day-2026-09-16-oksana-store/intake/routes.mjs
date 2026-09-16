// routes.mjs — правило маршрута живёт в КОДЕ, а не в промпте (OPERATOR-SPEC §4).
// Старт задаёт тип записи: вопрос о факте начинает со скриптов, вопрос о решении — сразу с opus,
// баг на живом — с sonnet. Так нижние уровни не тратятся там, где заведомо не ответят.

/** kind → уровень старта. null = ответа не бывает вовсе: карточка ждёт кнопки Ивана. */
export const ROUTES = {
  fact: 'script',
  where: 'script',
  status: 'script',
  live: 'script',
  howto: 'script',
  decision: 'opus',
  bug: 'sonnet',
  task: 'sonnet',
  remark: null,
  order: null,
  approval: 'script',
}

/** Лестница уровней: вверх переходят ТОЛЬКО когда гейт красный (OPERATOR-SPEC §2). */
export const LADDER = ['script', 'haiku', 'sonnet', 'opus', 'fable']

/** Что из ROUTES умеет Э1. Всё выше script на Э1 не запускается — вместо этого пишется эскалация. */
export const IMPLEMENTED = new Set(['script'])

export const startLevel = (kind) => (kind in ROUTES ? ROUTES[kind] : 'script')
export const nextLevel = (level) => LADDER[Math.min(LADDER.indexOf(level) + 1, LADDER.length - 1)]
/** Записи, которые НЕ отвечаются: задачу и баг готовят и ждут кнопки Ивана (правило 22j). */
export const AWAITS_IVAN = new Set(['decision', 'bug', 'task', 'remark', 'order'])
export const ANSWERABLE = new Set(['fact', 'where', 'status', 'live', 'howto'])
