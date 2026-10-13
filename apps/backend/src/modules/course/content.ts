import { z } from "@medusajs/framework/zod";

/**
 * A lesson's videos, files and links (t-2026-10-13-29 stage 2, the GetCourse
 * courses): the shapes `lesson.videos`, `lesson.attachments` and
 * `lesson.links` hold, the panel's write schemas, and how the Store API hands
 * them to a buyer.
 *
 * A video or a file the platform stores itself carries the file module's
 * `key` next to its `url`. The Store API never sends that `url`: it sends the
 * media route (`courseMediaPath`), which checks the buyer's access and then
 * redirects to a short-lived address of the file. An entry without `key` is
 * an address the owner pasted (a video on another host), passed on as it is.
 */

export const LESSON_LINK_KINDS = ["telegram_channel", "telegram_chat", "youtube", "other"] as const;
export type LessonLinkKind = (typeof LESSON_LINK_KINDS)[number];

export const LESSON_MAX_VIDEOS = 20;
export const LESSON_MAX_ATTACHMENTS = 50;
export const LESSON_MAX_LINKS = 20;

const url = z.string().trim().url().max(2_000);
const fileKey = z.string().trim().min(1).max(1_000);

const videoShape = {
  url,
  key: fileKey.optional(),
  title: z.string().trim().max(300).nullable().optional(),
  duration_sec: z.number().int().min(0).nullable().optional(),
  poster_url: url.nullable().optional(),
};

const attachmentShape = {
  name: z.string().trim().min(1).max(300),
  url,
  key: fileKey.optional(),
  size_bytes: z.number().int().min(0).nullable().optional(),
  mime: z.string().trim().max(200).nullable().optional(),
};

const linkShape = {
  kind: z.enum(LESSON_LINK_KINDS),
  url,
  title: z.string().trim().min(1).max(300),
};

/** What the panel may write, one entry each. */
export const LessonVideoSchema = z.strictObject(videoShape);
export const LessonAttachmentSchema = z.strictObject(attachmentShape);
export const LessonLinkSchema = z.strictObject(linkShape);

export const LessonVideosSchema = z.array(LessonVideoSchema).max(LESSON_MAX_VIDEOS);
export const LessonAttachmentsSchema = z.array(LessonAttachmentSchema).max(LESSON_MAX_ATTACHMENTS);
export const LessonLinksSchema = z.array(LessonLinkSchema).max(LESSON_MAX_LINKS);

export type LessonVideo = z.infer<typeof LessonVideoSchema>;
export type LessonAttachment = z.infer<typeof LessonAttachmentSchema>;
export type LessonLink = z.infer<typeof LessonLinkSchema>;

/**
 * The entries of a stored list that read as their shape, in order. One entry
 * that does not (a hand-edited row) is left out rather than costing the
 * lesson every other video. Anything but an array reads as none.
 */
const readList = <T>(value: unknown, schema: z.ZodType<T>): T[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
};

const readVideo = z.object(videoShape);
const readAttachment = z.object(attachmentShape);
const readLink = z.object(linkShape);

export const parseLessonVideos = (value: unknown): LessonVideo[] => readList(value, readVideo);
export const parseLessonAttachments = (value: unknown): LessonAttachment[] => readList(value, readAttachment);
export const parseLessonLinks = (value: unknown): LessonLink[] => readList(value, readLink);

/**
 * `GET /store/tenant/courses/:id/media?key=…`, the one address a stored file
 * of a course leaves the backend under. A path without an origin: the school
 * calls the Store API from its own server and resolves it there.
 */
export const courseMediaPath = (courseId: string, key: string): string =>
  `/store/tenant/courses/${encodeURIComponent(courseId)}/media?key=${encodeURIComponent(key)}`;

export type StoreLessonVideo = {
  url: string;
  title: string | null;
  duration_sec: number | null;
  poster_url: string | null;
};

export type StoreLessonAttachment = {
  name: string;
  url: string;
  size_bytes: number | null;
  mime: string | null;
};

const servedUrl = (courseId: string, entry: { url: string; key?: string }): string =>
  entry.key ? courseMediaPath(courseId, entry.key) : entry.url;

/** The lesson's videos as a buyer gets them: stored ones through the media route. */
export const toStoreVideos = (courseId: string, value: unknown): StoreLessonVideo[] =>
  parseLessonVideos(value).map((video) => ({
    url: servedUrl(courseId, video),
    title: video.title ?? null,
    duration_sec: video.duration_sec ?? null,
    poster_url: video.poster_url ?? null,
  }));

/** The lesson's files as a buyer gets them, the same way. */
export const toStoreAttachments = (courseId: string, value: unknown): StoreLessonAttachment[] =>
  parseLessonAttachments(value).map((attachment) => ({
    name: attachment.name,
    url: servedUrl(courseId, attachment),
    size_bytes: attachment.size_bytes ?? null,
    mime: attachment.mime ?? null,
  }));

/** Every file key a lesson's videos and files name, what the media route may serve for it. */
export const lessonFileKeys = (lesson: { videos?: unknown; attachments?: unknown }): Set<string> =>
  new Set(
    [...parseLessonVideos(lesson.videos), ...parseLessonAttachments(lesson.attachments)]
      .map((entry) => entry.key)
      .filter((key): key is string => Boolean(key)),
  );
