import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COURSE_MODULE } from "../../src/modules/course";
import { LessonQuizSchema, type LessonQuiz } from "../../src/modules/course/quiz";
import type CourseModuleService from "../../src/modules/course/service";
import type { CourseRow, LessonRow } from "../../src/api/tenants/courses/course-helpers";

/**
 * ask-20261005-061005-2e78: writes the tests after the lessons of «Очищение
 * печени» from `data/o24-courses/ochishchenie-pecheni-quiz.json` into
 * `lesson.quiz`, and touches no other field of any row.
 *
 * A course is found by its slug, in every shop that has one of the slugs the
 * file names (`ochishchenie-pecheni` on cherkashino-com, `ochischenie-pecheni`
 * where the panel slugified the title). A lesson is found by its `order` in
 * that course, and its title has to match the file's too: a lesson the owner
 * renamed, moved or deleted is skipped and counted, never handed another
 * lesson's questions. Idempotent: a lesson already holding the same test is
 * left alone, so a second run writes nothing.
 *
 * The stand first, the live shops only by the lead, after the deploy and
 * with a dump. `dry` counts what a run would write without writing it.
 *
 *   npx medusa exec ./scripts/fixtures/o24-seed-lesson-quizzes.ts dry
 *   npx medusa exec ./scripts/fixtures/o24-seed-lesson-quizzes.ts
 */
type QuizFile = {
  course_title: string;
  course_slugs: string[];
  lessons: Array<{ order: number; title: string; quiz: unknown }>;
};

const PREFIX = "o24-seed-lesson-quizzes";

const loadQuizFile = (): { slugs: string[]; lessons: Array<{ order: number; title: string; quiz: LessonQuiz }> } => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, "data/o24-courses/ochishchenie-pecheni-quiz.json"), "utf8"),
  ) as QuizFile;

  // Every test is checked before anything is written, so a typo in the file stops the run whole.
  const lessons = raw.lessons.map((lesson) => {
    const parsed = LessonQuizSchema.safeParse(lesson.quiz);
    if (!parsed.success) {
      throw new Error(`${PREFIX}: the test for lesson ${lesson.order} does not match LessonQuizSchema.`);
    }
    return { order: lesson.order, title: lesson.title, quiz: parsed.data };
  });

  return { slugs: raw.course_slugs, lessons };
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default async function seedO24LessonQuizzes({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);
  const dry = args.includes("dry");
  const file = loadQuizFile();

  const courses = (await courseService.listCourses({ slug: file.slugs })) as CourseRow[];
  if (!courses.length) {
    logger.info(`${PREFIX}: no course with slug ${file.slugs.join(" or ")}, nothing to do.`);
    return;
  }

  for (const course of courses) {
    const lessons = (await courseService.listLessons({
      tenant_id: course.tenant_id,
      course_id: course.id,
    })) as LessonRow[];
    const counts = { written: 0, unchanged: 0, titleMismatch: 0, missing: 0, ambiguous: 0 };
    const updates: Array<{ id: string; quiz: LessonQuiz }> = [];

    for (const entry of file.lessons) {
      const matches = lessons.filter((lesson) => lesson.order === entry.order);
      if (matches.length === 0) {
        counts.missing += 1;
        continue;
      }
      if (matches.length > 1) {
        counts.ambiguous += 1;
        continue;
      }
      const [lesson] = matches;
      if (lesson.title.trim() !== entry.title) {
        counts.titleMismatch += 1;
        logger.warn(`${PREFIX}: ${course.id} lesson ${entry.order} is titled differently, skipped.`);
        continue;
      }
      if (sameJson(lesson.quiz, entry.quiz)) {
        counts.unchanged += 1;
        continue;
      }
      updates.push({ id: lesson.id, quiz: entry.quiz });
      counts.written += 1;
    }

    if (!dry && updates.length) {
      await courseService.updateLessons(updates);
    }

    logger.info(
      `${PREFIX}: ${dry ? "[dry] " : ""}course ${course.id} (${course.slug}, tenant ${course.tenant_id}), ` +
        `${lessons.length} lessons: ${dry ? "would write" : "written"} ${counts.written}, ` +
        `unchanged ${counts.unchanged}, title mismatch ${counts.titleMismatch}, ` +
        `no lesson at that order ${counts.missing}, several lessons at that order ${counts.ambiguous}.`,
    );
  }
}
