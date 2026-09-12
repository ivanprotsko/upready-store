/**
 * layout.ts — единственный источник правды о РАСКЛАДКЕ главной страницы:
 * какие блоки есть, в каком порядке они идут и какие из них включены.
 *
 * Раскладка живёт в файле `public/homepage.cfg.json` (позиция блока = его
 * индекс в массиве `blocks`, статус = `visible`). Режим редактирования
 * (src/editor/) читает этот файл по HTTP и пишет обратно через dev-плагин
 * `plugins/homepage-config.ts`.
 *
 * Реестр секций (src/sections/index.ts) остаётся каноном КОДА: он говорит,
 * какие блоки вообще существуют и какой у них порядок по умолчанию. Конфиг
 * — это наложение поверх реестра, и `reconcile()` сводит их: незнакомые
 * slug'и выбрасываются, новые секции из реестра добавляются на своё
 * штатное место, а не молча теряются.
 */

import { sections } from "../sections";

export type Audience = "cold" | "warm" | "price";

/** Один блок страницы в конфиге. Позиция — это индекс в массиве. */
export interface BlockConfig {
  slug: string;
  visible: boolean;
}

export interface HomepageConfig {
  version: 1;
  updatedAt: string;
  blocks: BlockConfig[];
}

/** Отдаётся Vite как статика из public/ — работает и в dev, и в сборке. */
export const CONFIG_URL = "/homepage.cfg.json";
/** Запись — только dev-сервер (plugins/homepage-config.ts). */
export const CONFIG_API = "/__editor/config";

export const CONFIG_VERSION = 1 as const;

/**
 * Хром страницы: шапка и подвал — не блоки раскладки, их нельзя ни скрыть,
 * ни переместить (PageShell.tsx рендерит их отдельно).
 */
const CHROME_SLUGS = new Set(["shell"]);

/** Порядок блоков по умолчанию = порядок реестра без хрома. */
export const layoutSections = sections.filter((s) => !CHROME_SLUGS.has(s.slug));

export const sectionLabel = (slug: string): string =>
  layoutSections.find((s) => s.slug === slug)?.label ?? slug;

/**
 * Блоки, участвующие в сквозной нумерации «01 · Название»
 * (порт счётчика `order`/`num`, reference/dc-script.js строки 319-322).
 * Первый экран и финальный призыв номера не печатают.
 */
const NUMBERED = new Set(
  layoutSections.map((s) => s.slug).filter((slug) => slug !== "hero" && slug !== "final-cta"),
);

/**
 * Аудиторное ограничение из `renderVals()` (dc-script.js строки 339-340):
 * длинная версия «Почему это про вас» показывается холодной аудитории,
 * короткая — тёплой. Конфиг этим не управляет: он говорит, включён ли блок
 * вообще, а аудитория решает, какая из двух версий выйдет на экран.
 */
export const AUDIENCE_ONLY: Record<string, Audience> = {
  "proof-full": "cold",
  "proof-short": "warm",
};

/**
 * Значения по умолчанию воспроизводят страницу ДО появления конфига:
 * `DEFAULT_BLOCKS` старого App.tsx держал proof/frame/included/pricing/faq
 * выключенными, остальные секции рендерились всегда. На живом рендере это
 * девять секций с нумерацией 01…07.
 */
const DEFAULT_HIDDEN = new Set([
  "proof-full",
  "proof-short",
  "frame",
  "included",
  "pricing",
  "faq",
]);

export function defaultBlocks(): BlockConfig[] {
  return layoutSections.map((s) => ({ slug: s.slug, visible: !DEFAULT_HIDDEN.has(s.slug) }));
}

export function defaultConfig(updatedAt = new Date().toISOString()): HomepageConfig {
  return { version: CONFIG_VERSION, updatedAt, blocks: defaultBlocks() };
}

export interface ReconcileResult {
  config: HomepageConfig;
  /** Что пришлось поправить: новые секции, выброшенные slug'и, битый файл. */
  notes: string[];
}

/**
 * Сводит содержимое файла с реестром кода.
 *
 * Ноль — не пусто (правило 20a): если файла нет, он битый или пустой, это
 * видно в `notes`, а не подменяется молча дефолтом.
 */
export function reconcile(raw: unknown): ReconcileResult {
  const notes: string[] = [];
  const known = new Map(layoutSections.map((s, i) => [s.slug, i]));

  const rawBlocks =
    raw && typeof raw === "object" && Array.isArray((raw as HomepageConfig).blocks)
      ? (raw as HomepageConfig).blocks
      : null;

  if (!rawBlocks) {
    notes.push("конфиг не прочитан (нет файла или он не той формы) — взята раскладка по умолчанию");
    return { config: defaultConfig(), notes };
  }

  const seen = new Set<string>();
  const blocks: BlockConfig[] = [];
  for (const entry of rawBlocks) {
    const slug = entry && typeof entry === "object" ? String((entry as BlockConfig).slug) : "";
    if (!known.has(slug)) {
      notes.push(`блок «${slug}» в конфиге есть, а в коде его нет — пропущен`);
      continue;
    }
    if (seen.has(slug)) {
      notes.push(`блок «${slug}» указан в конфиге дважды — оставлено первое вхождение`);
      continue;
    }
    seen.add(slug);
    blocks.push({ slug, visible: (entry as BlockConfig).visible !== false });
  }

  /* Новая секция в коде встаёт на своё штатное место реестра, а не в хвост. */
  for (const [slug, registryIndex] of known) {
    if (seen.has(slug)) continue;
    notes.push(`блок «${slug}» появился в коде — добавлен в раскладку`);
    const at = blocks.findIndex((b) => (known.get(b.slug) ?? 0) > registryIndex);
    const fresh = { slug, visible: !DEFAULT_HIDDEN.has(slug) };
    if (at === -1) blocks.push(fresh);
    else blocks.splice(at, 0, fresh);
  }

  const updatedAt =
    raw && typeof (raw as HomepageConfig).updatedAt === "string"
      ? (raw as HomepageConfig).updatedAt
      : new Date().toISOString();

  return { config: { version: CONFIG_VERSION, updatedAt, blocks }, notes };
}

/** Показывается ли блок на обычной (не редактируемой) странице. */
export function isRendered(block: BlockConfig, audience: Audience): boolean {
  if (!block.visible) return false;
  const only = AUDIENCE_ONLY[block.slug];
  return only === undefined || only === audience;
}

/** Почему блока нет на странице — строкой для панели редактора. */
export function hiddenReason(block: BlockConfig, audience: Audience): string | null {
  if (!block.visible) return "выключен в конфиге";
  const only = AUDIENCE_ONLY[block.slug];
  if (only && only !== audience) return `только для аудитории «${only}»`;
  return null;
}

/**
 * Сквозная нумерация по ТЕКУЩЕЙ раскладке: номер получает каждый видимый
 * нумеруемый блок в том порядке, в каком он стоит в конфиге. Поэтому
 * перестановка блока меняет номера — ровно как в старом счётчике.
 */
export function numbering(blocks: BlockConfig[], audience: Audience): Record<string, string> {
  const num: Record<string, string> = {};
  let n = 0;
  for (const block of blocks) {
    if (!isRendered(block, audience)) continue;
    if (!NUMBERED.has(block.slug)) continue;
    n += 1;
    num[block.slug] = String(n).padStart(2, "0");
  }
  return num;
}

/** Переставить блок на одну позицию. Возвращает новый массив. */
export function moveBlock(blocks: BlockConfig[], slug: string, delta: -1 | 1): BlockConfig[] {
  const from = blocks.findIndex((b) => b.slug === slug);
  if (from === -1) return blocks;
  const to = from + delta;
  if (to < 0 || to >= blocks.length) return blocks;
  const next = blocks.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function toggleBlock(blocks: BlockConfig[], slug: string): BlockConfig[] {
  return blocks.map((b) => (b.slug === slug ? { ...b, visible: !b.visible } : b));
}
