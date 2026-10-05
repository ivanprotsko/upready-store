import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { upsertTranslationFields } from "../../src/api/tenants/products/translations-helpers";
import type { CourseRow, LessonRow } from "../../src/api/tenants/courses/course-helpers";
import { COURSE_MODULE } from "../../src/modules/course";
import type CourseModuleService from "../../src/modules/course/service";
import { LIVER_COURSE } from "../../src/scripts/course-content/liver-lessons";
import { courseTranslationPlan } from "../../src/scripts/course-content/liver-lessons-en";
import { notifyStorefrontRevalidate } from "../../src/storefront-revalidate";

/**
 * t-2026-10-04-19: writes the English of «Очищение печени» (the course's
 * title and description, every lesson title) as translation rows with the
 * reference `course` and `lesson`, locale `en`, for one shop. The text is
 * `src/scripts/course-content/liver-lessons-en.ts`; a lesson whose Russian
 * title is not one it translates is skipped and listed, and so is the course
 * row when its own Russian changed.
 *
 * Writes through `upsertTranslationFields`, the merge the panel's «Переводы»
 * screen uses, so a second run leaves the same rows. The SQL the lead runs on
 * a live database does the same write without booting the app.
 *
 *   npx medusa exec ./scripts/fixtures/o24-seed-course-translations.ts tenant=cherkashino-com dry
 *   npx medusa exec ./scripts/fixtures/o24-seed-course-translations.ts tenant=cherkashino-com
 */
const PREFIX = "o24-seed-course-translations";
const LOCALE = "en";
/** The slug the seed gives the course, and the one the panel made from the title on olavka. */
const SLUGS = [LIVER_COURSE.slug, "ochischenie-pecheni"];

const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export default async function seedO24CourseTranslations({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);
  const dry = args.includes("dry");
  const tenantHandle = readArg(args, "tenant");

  if (!tenantHandle) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${PREFIX}: pass tenant=<handle>`);
  }

  const {
    data: [tenant],
  } = await query.graph({ entity: "tenant", fields: ["id", "handle"], filters: { handle: tenantHandle } });
  if (!tenant?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `${PREFIX}: no shop with handle "${tenantHandle}"`);
  }

  const courses = (await courseService.listCourses({ tenant_id: tenant.id, slug: SLUGS })) as CourseRow[];
  if (!courses.length) {
    logger.info(`${PREFIX}: shop "${tenantHandle}" has no course with slug ${SLUGS.join(" or ")}, nothing to do.`);
    return;
  }

  let written = 0;
  for (const course of courses) {
    const lessons = (await courseService.listLessons({
      tenant_id: tenant.id,
      course_id: course.id,
    })) as LessonRow[];
    const plan = courseTranslationPlan(course, lessons);

    if (plan.courseSkipped) {
      logger.warn(`${PREFIX}: course ${course.id} has another Russian title or description, its row is skipped.`);
    }
    for (const lesson of plan.skippedLessons) {
      logger.warn(`${PREFIX}: ${course.id} lesson ${lesson.order} (${lesson.id}) has no English here, skipped.`);
    }

    if (!dry) {
      for (const row of plan.rows) {
        await upsertTranslationFields(container, row.reference, row.reference_id, LOCALE, row.fields);
      }
      written += plan.rows.length;
    }

    logger.info(
      `${PREFIX}: ${dry ? "[dry] " : ""}course ${course.id} (${course.slug}), ${lessons.length} lessons: ` +
        `${dry ? "would write" : "written"} ${plan.rows.length} rows, ` +
        `course row ${plan.courseSkipped ? "skipped" : "included"}, lessons skipped ${plan.skippedLessons.length}.`,
    );
  }

  if (written) {
    await notifyStorefrontRevalidate({ type: "translation.updated", handle: tenant.handle as string });
  }
}
