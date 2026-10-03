import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../modules/course";
import type CourseModuleService from "../modules/course/service";
import type { CourseRow, LessonRow } from "../api/tenants/courses/course-helpers";
import { LIVER_COURSE, LIVER_LESSONS } from "./course-content/liver-lessons";

/**
 * Puts the course «Очищение печени» with its lessons and videos on one
 * product of one shop. The course row belongs to `tenant`, the shop whose
 * storefront sells it: the store course routes scope by the publishable
 * key's tenant, while `grant-course-on-paid` finds courses by `product_id`
 * alone. So a product shared across a group (olavka's product on
 * cherkashino.com) gets one course row per selling shop, by running this once
 * per shop.
 *
 * Videos and PDFs are served from `media` (default: olavka's course folder on
 * the platform's static host); the files themselves are copied there by hand.
 *
 *   npx medusa exec ./src/scripts/seed-course-lessons.js tenant=<handle> product=<handle> dry-run
 *   npx medusa exec ./src/scripts/seed-course-lessons.js tenant=<handle> product=<handle> [media=<url>] [prune]
 *
 * Idempotent: the course is found by (tenant, product), then by (tenant,
 * slug), and created only when neither exists; it is set `published`. Lesson
 * N of the list is the course's lesson with `order` N, updated in place when
 * it differs, so ids, and the progress rows pointing at them, survive a
 * re-run. A lesson outside 1..N is listed and left alone, unless `prune`
 * soft-deletes it.
 */
const DEFAULT_MEDIA =
  "https://shipshift.dev/static/tenants/ten_01M2GQVGEN1204CN90C510DNRG/courses/ochishchenie-pecheni";

const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export default async function seedCourseLessons({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);
  const dryRun = args.includes("dry-run");
  const prune = args.includes("prune");
  const tenantHandle = readArg(args, "tenant");
  const productHandle = readArg(args, "product");
  const media = (readArg(args, "media") ?? DEFAULT_MEDIA).replace(/\/+$/, "");

  if (!tenantHandle || !productHandle) {
    throw new Error("seed-course-lessons: pass tenant=<handle> product=<handle>");
  }

  const {
    data: [tenant],
  } = await query.graph({ entity: "tenant", fields: ["id", "handle"], filters: { handle: tenantHandle } });
  if (!tenant?.id) {
    throw new Error(`seed-course-lessons: tenant "${tenantHandle}" was not found`);
  }

  const {
    data: [product],
  } = await query.graph({ entity: "product", fields: ["id", "title", "status"], filters: { handle: productHandle } });
  if (!product?.id) {
    throw new Error(`seed-course-lessons: product "${productHandle}" was not found`);
  }

  const tenantId = tenant.id as string;
  const productId = product.id as string;
  logger.info(`seed-course-lessons: tenant ${tenantId}, product ${productId} "${product.title}" (${product.status})`);

  let [course] = (await courseService.listCourses({ tenant_id: tenantId, product_id: productId })) as CourseRow[];
  if (!course) {
    const [bySlug] = (await courseService.listCourses({ tenant_id: tenantId, slug: LIVER_COURSE.slug })) as CourseRow[];
    if (bySlug) {
      throw new Error(
        `seed-course-lessons: course ${bySlug.id} with slug "${LIVER_COURSE.slug}" sells product ${bySlug.product_id}, not ${productId}`,
      );
    }
  }

  const courseFields = { title: LIVER_COURSE.title, description: LIVER_COURSE.description, status: "published" as const };

  if (!course) {
    logger.info(`seed-course-lessons: would create course "${LIVER_COURSE.slug}"`);
    if (dryRun) {
      logger.info(`seed-course-lessons: dry-run, would also create ${LIVER_LESSONS.length} lessons`);
      return;
    }
    const created = await courseService.createCourses({
      tenant_id: tenantId,
      product_id: productId,
      slug: LIVER_COURSE.slug,
      ...courseFields,
    });
    course = (Array.isArray(created) ? created[0] : created) as CourseRow;
    logger.info(`seed-course-lessons: created course ${course.id}`);
  } else if (
    course.title !== courseFields.title ||
    course.description !== courseFields.description ||
    course.status !== courseFields.status
  ) {
    logger.info(`seed-course-lessons: course ${course.id} (${course.status}) would be updated and published`);
    if (!dryRun) {
      await courseService.updateCourses({ id: course.id, ...courseFields });
    }
  } else {
    logger.info(`seed-course-lessons: course ${course.id} already up to date`);
  }

  const existing = (await courseService.listLessons({ tenant_id: tenantId, course_id: course.id })) as LessonRow[];
  const byOrder = new Map<number, LessonRow>();
  for (const lesson of existing) {
    if (!byOrder.has(lesson.order)) byOrder.set(lesson.order, lesson);
  }

  let created = 0;
  let updated = 0;
  for (const [index, content] of LIVER_LESSONS.entries()) {
    const order = index + 1;
    const wanted = {
      title: content.title,
      body: content.body.replaceAll("{MEDIA}", media),
      video_url: content.video_file ? `${media}/${content.video_file}` : null,
    };
    const current = byOrder.get(order);

    if (!current) {
      created += 1;
      if (!dryRun) {
        await courseService.createLessons({ tenant_id: tenantId, course_id: course.id, order, ...wanted });
      }
      continue;
    }

    if (current.title !== wanted.title || current.body !== wanted.body || current.video_url !== wanted.video_url) {
      updated += 1;
      if (!dryRun) {
        await courseService.updateLessons({ id: current.id, ...wanted });
      }
    }
  }

  const keep = new Set(LIVER_LESSONS.map((_content, index) => byOrder.get(index + 1)?.id).filter(Boolean));
  const extra = existing.filter((lesson) => !keep.has(lesson.id));
  for (const lesson of extra) {
    logger.info(`seed-course-lessons: extra lesson ${lesson.id} order ${lesson.order} "${lesson.title}"`);
  }
  if (extra.length && prune && !dryRun) {
    await courseService.softDeleteLessons(extra.map((lesson) => lesson.id));
  }

  logger.info(
    `seed-course-lessons: ${dryRun ? "dry-run, would have " : ""}created ${created}, updated ${updated}, ` +
      `${extra.length} extra${extra.length ? (prune && !dryRun ? " soft-deleted" : " left alone (pass prune)") : ""}`,
  );
}
