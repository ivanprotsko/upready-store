import type { ExecArgs, IFileModuleService, Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { createReadStream, existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import type { CourseRow, LessonRow } from "../api/tenants/courses/course-helpers";
import { COURSE_MODULE } from "../modules/course";
import { courseMediaPath, type LessonAttachment, type LessonVideo } from "../modules/course/content";
import type CourseModuleService from "../modules/course/service";
import { firstFreeSlug, toSlug } from "../product-csv/slugify";
import { listFilesUnderPrefix } from "../tenant-files";
import {
  type ExportCourse,
  type ExportDrip,
  type ExportLesson,
  dripDayOf,
  exportPath,
  linksOf,
  mimeOf,
  rewriteLessonMarkdown,
  sectionOf,
  stripExportHeader,
} from "./course-import/export-format";

/**
 * Imports one course of the GetCourse export into a shop (t-2026-10-13-29
 * stage 2): its lessons with their text, sections, covers, videos, files and
 * links, and the files themselves through the file module.
 *
 *   npx medusa exec ./src/scripts/course-import-export.ts \
 *     export=<abs folder of one course> tenant=<host> course=<course slug or product handle> [dry-run]
 *
 * Each argument also reads as `--export=…` or `--export …`, and from
 * `COURSE_IMPORT_EXPORT`, `COURSE_IMPORT_TENANT`, `COURSE_IMPORT_COURSE` and
 * `COURSE_IMPORT_DRY_RUN=1`, which no wrapper can reshape (`medusa exec` eats
 * some dashes, `ozon-args.ts`). The runbook is `docs/courses/import-getcourse.md`.
 *
 * - The shop is found by its host (`tenant_domain`), the course by its slug,
 *   else by the shop's product with that handle. A product without a course
 *   gets one, a draft titled after the product: publishing it, and marking a
 *   product that sells nothing but the course digital
 *   (`scripts/mark-course-product.ts`), is the owner's call.
 * - Videos and files go up private, pictures and covers public, under
 *   `courses/<tenant_id>/<course slug>/`. A lesson keeps a video's or a file's
 *   key, and the buyer gets it through the media route; a picture stays its
 *   public address.
 * - Re-runnable. A lesson is matched by its GetCourse id
 *   (`lesson.metadata.getcourse_id`) and updated in place, so its id and the
 *   buyers' progress survive. A file is uploaded again only when the key the
 *   lessons recorded for it (`metadata.getcourse_files`) is gone from storage
 *   or has another size. A lesson of the course that did not come from the
 *   export is listed and left alone; nothing is deleted.
 * - `drip.json` next to `course.json` sets the day a lesson opens on; without
 *   it the days already on the lessons stay.
 * - `dry-run` reads everything, uploads and writes nothing, and prints the same
 *   summary.
 */

type Args = { exportDir: string | null; tenant: string | null; course: string | null; dryRun: boolean };

const NAMES = ["export", "tenant", "course"] as const;

export const parseImportArgs = (args: string[] = [], env: NodeJS.ProcessEnv = process.env): Args => {
  const values: Record<string, string | null> = { export: null, tenant: null, course: null };
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const bare = String(args[index]).replace(/^--?/, "");
    const [name, ...rest] = bare.split("=");
    if (rest.length && (NAMES as readonly string[]).includes(name)) {
      values[name] = rest.join("=");
      continue;
    }
    if ((NAMES as readonly string[]).includes(bare) && args[index + 1] && !String(args[index + 1]).startsWith("-")) {
      values[bare] = String(args[index + 1]);
      index += 1;
      continue;
    }
    flags.add(bare);
  }

  return {
    exportDir: values.export ?? env.COURSE_IMPORT_EXPORT ?? null,
    tenant: values.tenant ?? env.COURSE_IMPORT_TENANT ?? null,
    course: values.course ?? env.COURSE_IMPORT_COURSE ?? null,
    dryRun: flags.has("dry-run") || flags.has("dry") || env.COURSE_IMPORT_DRY_RUN === "1",
  };
};

/** What the lessons recorded about one uploaded file of the export, by its path in the export. */
type UploadRecord = { key: string; url: string; size_bytes: number };

type Summary = {
  lessons_created: number;
  lessons_updated: number;
  lessons_unchanged: number;
  files_uploaded: number;
  files_skipped: number;
  bytes_uploaded: number;
  bytes_skipped: number;
  missing: string[];
  foreign_lessons: string[];
};

type ProductRow = { id: string; handle: string; title: string; status?: string | null };

const readJson = async <T>(file: string): Promise<T | null> =>
  existsSync(file) ? (JSON.parse(await fs.readFile(file, "utf8")) as T) : null;

/** The file name a key ends in: ASCII, the way the product importer spells a handle. */
const safeName = (file: string): string => {
  const extension = path.extname(file).toLowerCase();
  const base = toSlug(path.basename(file, path.extname(file))) || "file";
  return `${base}${extension}`;
};

const storageFolder = (file: string): string => {
  if (file.startsWith("videos/")) return "videos";
  if (file.startsWith("files/")) return "files";
  return "images";
};

/** JSON with every object's keys sorted: Postgres `jsonb` hands keys back in its own order. */
const stableJson = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

const sameJson = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

export default async function courseImportExport({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const say = (message: string) => logger.info(`course-import-export: ${message}`);
  const options = parseImportArgs(args);

  if (!options.exportDir || !options.tenant || !options.course) {
    throw new Error(
      "course-import-export: pass export=<abs folder of one course> tenant=<host> course=<course slug or product handle> [dry-run]",
    );
  }

  const exportDir = path.resolve(options.exportDir);
  const exported = await readJson<ExportCourse>(path.join(exportDir, "course.json"));
  if (!exported?.lessons?.length) {
    throw new Error(`course-import-export: ${exportDir}/course.json holds no lessons`);
  }
  const drip = await readJson<ExportDrip>(path.join(exportDir, "drip.json"));
  const dryRun = options.dryRun;

  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const domain = (await pg("tenant_domain")
    .select("tenant_id")
    .where({ host: options.tenant })
    .whereNull("deleted_at")
    .first()) as { tenant_id: string } | undefined;
  if (!domain) {
    throw new Error(`course-import-export: no shop answers on ${options.tenant} in this database`);
  }
  const tenantId = domain.tenant_id;

  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);
  const course = await findOrCreateCourse(container, courseService, tenantId, options.course, dryRun, say);
  const courseId = course?.id ?? "dry-run-course";
  const courseSlug = course?.slug ?? toSlug(options.course);
  const prefix = `courses/${tenantId}/${courseSlug}/`;

  say(
    `${dryRun ? "DRY RUN, " : ""}${exported.lessons.length} lessons of «${exported.title}» from ${exportDir} ` +
      `into course ${courseId} (${courseSlug}) of shop ${tenantId}, files under ${prefix}` +
      `${drip ? `, drip.json for ${Object.keys(drip.lessons ?? {}).length} lessons` : ", no drip.json"}`,
  );

  const existing = course
    ? ((await courseService.listLessons({ tenant_id: tenantId, course_id: course.id })) as LessonRow[])
    : [];
  const byGetcourseId = new Map<string, LessonRow>();
  const recorded = new Map<string, UploadRecord>();
  for (const lesson of existing) {
    const getcourseId = lesson.metadata?.getcourse_id;
    if (typeof getcourseId === "string") {
      byGetcourseId.set(getcourseId, lesson);
    }
    const files = (lesson.metadata?.getcourse_files ?? {}) as Record<string, UploadRecord>;
    for (const [file, record] of Object.entries(files)) {
      recorded.set(file, record);
    }
  }

  const stored = new Map((await listFilesUnderPrefix(container, prefix)).map((file) => [file.key, file.size]));
  const fileService: IFileModuleService = container.resolve(Modules.FILE);
  const summary: Summary = {
    lessons_created: 0,
    lessons_updated: 0,
    lessons_unchanged: 0,
    files_uploaded: 0,
    files_skipped: 0,
    bytes_uploaded: 0,
    bytes_skipped: 0,
    missing: [],
    foreign_lessons: existing
      .filter((lesson) => typeof lesson.metadata?.getcourse_id !== "string")
      .map((lesson) => `${lesson.id} #${lesson.order} «${lesson.title}»`),
  };

  const uploads = new Map<string, Promise<UploadRecord | null>>();

  /** The file of the export at `file`, uploaded once per run and only when storage lacks it. */
  const upload = (file: string, access: "public" | "private"): Promise<UploadRecord | null> => {
    const known = uploads.get(file);
    if (known) {
      return known;
    }

    const run = (async (): Promise<UploadRecord | null> => {
      const absolute = path.join(exportDir, file);
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat?.isFile()) {
        summary.missing.push(file);
        return null;
      }

      const before = recorded.get(file);
      if (before && stored.get(before.key) === stat.size) {
        summary.files_skipped += 1;
        summary.bytes_skipped += stat.size;
        return before;
      }

      summary.files_uploaded += 1;
      summary.bytes_uploaded += stat.size;
      if (dryRun) {
        return { key: `${prefix}${file}`, url: `dry-run:${file}`, size_bytes: stat.size };
      }

      const { writeStream, promise } = await fileService.getUploadStream({
        filename: `${prefix}${storageFolder(file)}/${safeName(file)}`,
        mimeType: mimeOf(file),
        access,
      });
      await pipeline(createReadStream(absolute), writeStream);
      const result = await promise;
      say(`uploaded ${file} (${stat.size} bytes) as ${result.key}`);

      return { key: result.key, url: result.url, size_bytes: stat.size };
    })();

    uploads.set(file, run);
    return run;
  };

  const channelLinks: { telegram_channel_url?: string; telegram_chat_url?: string } = {};

  for (const lesson of [...exported.lessons].sort((a, b) => a.n - b.n)) {
    const wanted = await lessonFromExport(exported, lesson, exportDir, courseId, upload);
    for (const link of wanted.links) {
      if (link.kind === "telegram_channel") channelLinks.telegram_channel_url ??= link.url;
      if (link.kind === "telegram_chat") channelLinks.telegram_chat_url ??= link.url;
    }

    const current = byGetcourseId.get(lesson.id);
    const fields = {
      title: lesson.title,
      order: lesson.n,
      body: wanted.body,
      video_url: wanted.videos[0]?.url ?? null,
      section: wanted.section,
      section_order: wanted.section_order,
      cover_url: wanted.cover_url,
      summary: lesson.listDescription?.trim() || null,
      videos: wanted.videos,
      attachments: wanted.attachments,
      links: wanted.links,
      ...(drip || !current ? { available_from_day: dripDayOf(drip, lesson.id) } : {}),
      metadata: {
        ...(current?.metadata ?? {}),
        getcourse_id: lesson.id,
        getcourse_url: lesson.url ?? null,
        getcourse_files: wanted.files,
      },
    };
    const write = fields as unknown as Record<string, unknown> & { title: string; order: number; body: string };

    if (!current) {
      summary.lessons_created += 1;
      say(`lesson ${lesson.n} «${lesson.title}»: new`);
      if (!dryRun && course) {
        await courseService.createLessons({ tenant_id: tenantId, course_id: course.id, ...write });
      }
      continue;
    }

    const changed = Object.entries(fields).filter(
      ([key, value]) => !sameJson((current as unknown as Record<string, unknown>)[key], value),
    );
    if (!changed.length) {
      summary.lessons_unchanged += 1;
      continue;
    }

    summary.lessons_updated += 1;
    say(`lesson ${lesson.n} «${lesson.title}» (${current.id}): ${changed.map(([key]) => key).join(", ")}`);
    if (!dryRun) {
      await courseService.updateLessons({ id: current.id, ...write });
    }
  }

  if (course) {
    const fill = {
      ...(!course.telegram_channel_url && channelLinks.telegram_channel_url
        ? { telegram_channel_url: channelLinks.telegram_channel_url }
        : {}),
      ...(!course.telegram_chat_url && channelLinks.telegram_chat_url
        ? { telegram_chat_url: channelLinks.telegram_chat_url }
        : {}),
    };
    if (Object.keys(fill).length) {
      say(`course ${course.id}: ${Object.entries(fill).map(([key, value]) => `${key} ${value}`).join(", ")}`);
      if (!dryRun) {
        await courseService.updateCourses({ id: course.id, ...fill });
      }
    }
  }

  for (const lesson of summary.foreign_lessons) {
    say(`lesson ${lesson} is not from the export, left alone`);
  }
  for (const file of summary.missing) {
    say(`missing in the export: ${file}`);
  }

  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  say(
    `${dryRun ? "DRY RUN, would have: " : "done: "}lessons ${summary.lessons_created} created, ` +
      `${summary.lessons_updated} updated, ${summary.lessons_unchanged} unchanged; files ` +
      `${summary.files_uploaded} uploaded (${mb(summary.bytes_uploaded)}), ${summary.files_skipped} skipped ` +
      `(${mb(summary.bytes_skipped)}); ${summary.missing.length} missing; ` +
      `${summary.foreign_lessons.length} lessons not from the export left alone`,
  );
  say(`summary ${JSON.stringify({ course_id: courseId, dry_run: dryRun, ...summary })}`);
}

/** The lesson the export describes, its files uploaded through `upload`. */
async function lessonFromExport(
  exported: ExportCourse,
  lesson: ExportLesson,
  exportDir: string,
  courseId: string,
  upload: (file: string, access: "public" | "private") => Promise<UploadRecord | null>,
) {
  const files: Record<string, UploadRecord> = {};
  const keep = async (file: string, access: "public" | "private") => {
    const record = await upload(file, access);
    if (record) {
      files[file] = record;
    }
    return record;
  };

  const markdown = stripExportHeader(await fs.readFile(path.join(exportDir, lesson.md), "utf8").catch(() => ""));

  // Every address the text names, uploaded before the text is rewritten against them.
  const targets = new Map<string, string | null>();
  rewriteLessonMarkdown(markdown, (target) => {
    targets.set(target.file, null);
    return null;
  });
  for (const file of targets.keys()) {
    const access = file.startsWith("lessons/") ? "public" : "private";
    const record = await keep(file, access);
    targets.set(file, record ? (access === "public" ? record.url : courseMediaPath(courseId, record.key)) : null);
  }
  const body = rewriteLessonMarkdown(markdown, (target) => targets.get(target.file) ?? null);

  const videos: LessonVideo[] = [];
  for (const video of lesson.videos) {
    if (!video.fileId || !video.downloaded) {
      continue;
    }
    const record = await keep(exportPath("videos", `${video.fileId}.mp4`), "private");
    if (record) {
      videos.push({
        url: record.url,
        key: record.key,
        ...(typeof video.durationSec === "number" ? { duration_sec: Math.round(video.durationSec) } : {}),
      });
    }
  }

  const attachments: LessonAttachment[] = [];
  for (const file of lesson.files) {
    const exportFile = exportPath("files", file.name);
    const record = await keep(exportFile, "private");
    if (record) {
      attachments.push({
        name: file.name,
        url: record.url,
        key: record.key,
        size_bytes: record.size_bytes,
        mime: mimeOf(exportFile),
      });
    }
  }

  const cover = lesson.cover ? await keep(exportPath(lesson.cover), "public") : null;

  return {
    body,
    videos,
    attachments,
    links: linksOf(lesson, markdown),
    cover_url: cover?.url ?? null,
    files,
    ...sectionOf(exported, lesson),
  };
}

/** The course to import into: by slug, else by the shop's product with that handle, else a new draft on it. */
async function findOrCreateCourse(
  container: MedusaContainer,
  courseService: CourseModuleService,
  tenantId: string,
  slugOrHandle: string,
  dryRun: boolean,
  say: (message: string) => void,
): Promise<CourseRow | null> {
  const [bySlug] = (await courseService.listCourses({ tenant_id: tenantId, slug: slugOrHandle })) as CourseRow[];
  if (bySlug) {
    say(`course ${bySlug.id} «${bySlug.title}» (${bySlug.status}) by its slug`);
    return bySlug;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id", "products.handle", "products.title", "products.status"],
    filters: { id: tenantId },
  });
  const product = ((data[0]?.products ?? []) as Array<ProductRow | null>).find(
    (row): row is ProductRow => row?.handle === slugOrHandle,
  );
  if (!product) {
    throw new Error(`course-import-export: shop ${tenantId} has no course «${slugOrHandle}» and no product with that handle`);
  }

  const [byProduct] = (await courseService.listCourses({ tenant_id: tenantId, product_id: product.id })) as CourseRow[];
  if (byProduct) {
    say(`course ${byProduct.id} «${byProduct.title}» (${byProduct.status}) of product ${product.handle}`);
    return byProduct;
  }

  const taken = new Set(
    ((await courseService.listCourses({ tenant_id: tenantId })) as CourseRow[]).map((row) => row.slug),
  );
  const slug = firstFreeSlug(toSlug(product.title) || toSlug(product.handle) || "course", taken);
  say(
    `product ${product.handle} (${product.id}, ${product.status}) sells no course yet: ` +
      `${dryRun ? "would create" : "creating"} a draft course «${product.title}» (${slug}); ` +
      "publishing it, and marking the product digital if it sells nothing but the course, are the owner's",
  );
  if (dryRun) {
    return null;
  }

  const created = await courseService.createCourses({
    tenant_id: tenantId,
    product_id: product.id,
    title: product.title,
    slug,
    status: "draft",
  });
  return (Array.isArray(created) ? created[0] : created) as CourseRow;
}
