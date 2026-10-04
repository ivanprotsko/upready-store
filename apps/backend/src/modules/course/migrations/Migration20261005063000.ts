import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * ask-20261005-061005-2e78: the nullable `lesson.quiz` (`models/lesson.ts`),
 * the test the storefront shows after a lesson. Additive only: every existing
 * lesson keeps `quiz` null and has no test until one is written for it.
 */
export class Migration20261005063000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "lesson" add column if not exists "quiz" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "lesson" drop column if exists "quiz";`);
  }

}
