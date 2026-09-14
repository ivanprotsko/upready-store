/**
 * log.ts — лог оператора: одна строка JSON на событие в stdout.
 *
 * Смысл строки — не «бот работает», а то, по чему потом чинят: какой payload
 * пришёл, что ушло в Telegram и какой платёжной ссылки не хватило. Поэтому
 * исходящее сообщение пишется ЦЕЛИКОМ — это и есть захват payload'а
 * `sendMessage` живого прогона.
 *
 * Запуск направляют в файл (`node src/index.ts > run.log 2>&1`): фильтр на
 * конвейере держал бы поток до конца процесса, и живой бот был бы неотличим
 * от повисшего (правило 5h).
 */

export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}
