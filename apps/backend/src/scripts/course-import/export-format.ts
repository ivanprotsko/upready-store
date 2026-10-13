import path from "path";
import type { LessonLink, LessonLinkKind } from "../../modules/course/content";

/**
 * The GetCourse export a course is imported from (t-2026-10-13-29 stage 1,
 * `/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-13-29/export/README.md`),
 * and the pure half of `course-import-export.ts`: what a lesson of the export
 * turns into, with the uploads left to the caller.
 *
 * One folder per course: `course.json`, `lessons/<nn>-<slug>.md` with its
 * pictures next to it, `files/`, `videos/<fileId>.mp4`, and an optional
 * `drip.json` naming the day of the program a lesson opens on.
 */

export type ExportVideo = {
  fileId: string | null;
  durationSec?: number | null;
  downloaded?: boolean;
  path?: string | null;
  sizeBytes?: number | null;
  external?: string | null;
};

export type ExportFile = { name: string; path?: string | null; sizeBytes?: number | null };

export type ExportExternal = { kind: string; url: string };

export type ExportLesson = {
  n: number;
  id: string;
  title: string;
  module: string | null;
  moduleId: string | null;
  url?: string | null;
  listDescription: string | null;
  md: string;
  cover: string | null;
  images?: Array<{ file: string }>;
  files: ExportFile[];
  videos: ExportVideo[];
  external: ExportExternal[];
};

export type ExportModule = { id: string; title: string; lessonIds: string[] };

export type ExportCourse = {
  course: string;
  title: string;
  modules: ExportModule[];
  lessons: ExportLesson[];
};

/**
 * `drip.json`: the GetCourse lesson id → the day of the program it opens on,
 * day 1 being the first day of access (`lesson.available_from_day`). A lesson
 * it does not name opens at once.
 */
export type ExportDrip = { lessons: Record<string, number> };

/** The export's path of a file, relative to the course folder, in `/` form. */
export const exportPath = (...parts: string[]): string => path.posix.normalize(parts.join("/"));

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const mimeOf = (file: string): string =>
  MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/** The section of a lesson and its place, from the export's `modules[]` (lymph has five, liver none). */
export const sectionOf = (
  course: Pick<ExportCourse, "modules">,
  lesson: Pick<ExportLesson, "id" | "module" | "moduleId">,
): { section: string | null; section_order: number | null } => {
  const index = course.modules.findIndex(
    (module) => module.id === lesson.moduleId || module.lessonIds.includes(lesson.id),
  );
  if (index === -1) {
    return { section: lesson.module ?? null, section_order: null };
  }

  return { section: course.modules[index].title, section_order: index + 1 };
};

/** The header the export writes above a lesson's text: its title and the GetCourse lines. */
const HEADER_LINE = /^- (GetCourse lesson id|Lesson URL|Module|Description in the lesson list):/;

/**
 * The lesson's markdown without the export's own header: the `# Title` line
 * (the title is its own field) and the lines naming the GetCourse lesson, its
 * address, its module and its list description, none of which a buyer reads.
 */
export const stripExportHeader = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  if (lines[index]?.startsWith("# ")) {
    index += 1;
  }
  while (index < lines.length && (lines[index].trim() === "" || HEADER_LINE.test(lines[index]))) {
    index += 1;
  }

  return lines.slice(index).join("\n").trimEnd();
};

/** Where a markdown link or picture of a lesson points, resolved against the course folder. */
export type LessonTarget =
  | { kind: "video"; file: string }
  | { kind: "file"; file: string }
  | { kind: "image"; file: string };

/**
 * A relative address of the lesson's markdown, as the export writes it:
 * `../videos/<id>.mp4`, `../files/<name>` (percent-encoded), or a picture next
 * to the lesson. An absolute address (`https:`, `/…`, `#…`) is not the
 * export's and stays as it is.
 */
export const classifyTarget = (href: string, isImage: boolean): LessonTarget | null => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) {
    return null;
  }

  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    // A stray `%` in a name: the address as written is the best reading.
  }
  const file = exportPath("lessons", decoded);

  if (file.startsWith("videos/")) {
    return { kind: "video", file };
  }
  if (file.startsWith("files/")) {
    return { kind: "file", file };
  }
  if (isImage || /\.(jpe?g|png|webp|gif)$/i.test(file)) {
    return { kind: "image", file };
  }

  return null;
};

/**
 * The lesson's markdown with every address of the export replaced by the one
 * `resolve` gives (the media route for a video or a file, the public address
 * for a picture). An address `resolve` has nothing for stays as written, so a
 * missing file shows up as a dead link in the report rather than vanishing. A
 * video link's text, the export's file name, reads «Видео».
 */
export const rewriteLessonMarkdown = (
  markdown: string,
  resolve: (target: LessonTarget) => string | null,
): string =>
  markdown.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, bang: string, text: string, href: string) => {
    const target = classifyTarget(href, bang === "!");
    if (!target) {
      return whole;
    }

    const url = resolve(target);
    if (!url) {
      return whole;
    }

    const label = target.kind === "video" && /^videos\/[^/]+\.mp4$/.test(text) ? "Видео" : text;
    return `${bang}[${label}](${url})`;
  });

/** The text of the markdown link to `url` in the lesson, and the nearest line with words above it. */
const linkContext = (markdown: string, url: string): { text: string; before: string } | null => {
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const links = lines[index].match(/\[([^\]]*)\]\(([^)\s]+)\)/g);
    const link = links?.find((candidate) => candidate.endsWith(`(${url})`));
    if (link) {
      const text = link.slice(1, link.indexOf("]("));
      const before = [...lines.slice(0, index)].reverse().find((line) => /[\p{L}]/u.test(line)) ?? "";
      return { text, before };
    }
  }

  return null;
};

/** A Telegram invite is a chat when its link, or else the line above it, says so. */
const isTelegramChat = (context: { text: string; before: string } | null): boolean => {
  const text = context?.text.toLowerCase() ?? "";
  if (/чат|chat/.test(text)) {
    return true;
  }
  if (/канал|channel/.test(text)) {
    return false;
  }

  return /чат|chat/.test(context?.before.toLowerCase() ?? "");
};

const DEFAULT_LINK_TITLES: Record<LessonLinkKind, string> = {
  telegram_channel: "Телеграм-канал",
  telegram_chat: "Телеграм-чат",
  youtube: "Видео на YouTube",
  other: "Ссылка",
};

/**
 * The export's `external[]` as `lesson.links`. A Telegram invite does not say
 * whether it is a channel or a chat, so the lesson's own words decide: the
 * link's text («Вступить в чат»), else the line above it («ССЫЛКА НА ЧАТ»), a
 * channel when neither names a chat. The title is the link's text in the lesson, else a plain name of
 * its kind. One address is listed once.
 */
export const linksOf = (lesson: Pick<ExportLesson, "external">, markdown: string): LessonLink[] => {
  const seen = new Set<string>();
  const links: LessonLink[] = [];

  for (const external of lesson.external) {
    if (!external.url || seen.has(external.url)) {
      continue;
    }
    seen.add(external.url);

    const context = linkContext(markdown, external.url);
    let kind: LessonLinkKind = "other";
    if (external.kind === "youtube" || /youtu\.?be/i.test(external.url)) {
      kind = "youtube";
    } else if (external.kind === "telegram" || /^https?:\/\/t\.me\//i.test(external.url)) {
      kind = isTelegramChat(context) ? "telegram_chat" : "telegram_channel";
    }

    const text = context?.text.trim();
    links.push({ kind, url: external.url, title: text || DEFAULT_LINK_TITLES[kind] });
  }

  return links;
};

/** The day `drip.json` gives the lesson, or null; a day below 1 reads as null. */
export const dripDayOf = (drip: ExportDrip | null, lessonId: string): number | null => {
  const day = drip?.lessons?.[lessonId];
  return typeof day === "number" && Number.isInteger(day) && day > 1 ? day : null;
};
