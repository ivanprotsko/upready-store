import { DmlEntity, toSnakeCase } from "@medusajs/framework/utils";
import "../models/course";
import "../models/lesson";
import {
  COURSE_REFERENCE,
  COURSE_TRANSLATABLE_FIELDS,
  LESSON_REFERENCE,
  LESSON_TRANSLATABLE_FIELDS,
} from "../../../api/store/tenant/courses/store-course-helpers";

/**
 * t-2026-10-04-19: what the translation module reads at boot. Its
 * `onApplicationStart` walks `DmlEntity.getTranslatableEntities()` and inserts
 * a `translation_settings` row, `entity_type` the snake case of the entity, for
 * every translatable entity that has none yet. That row is what lets
 * `listTranslations` hand back a field at all: it keeps only the fields the
 * settings name. So the store routes find the English only if the models
 * register these fields under the very references they read.
 */
describe("course and lesson translatable fields", () => {
  const registered = () =>
    new Map(DmlEntity.getTranslatableEntities().map((entry) => [toSnakeCase(entry.entity), entry.fields]));

  it("registers the course's title and description under the reference the store routes read", () => {
    expect(registered().get(COURSE_REFERENCE)?.sort()).toEqual([...COURSE_TRANSLATABLE_FIELDS].sort());
  });

  it("registers the lesson's title, and not its body or test", () => {
    expect(registered().get(LESSON_REFERENCE)).toEqual([...LESSON_TRANSLATABLE_FIELDS]);
  });
});
