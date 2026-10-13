import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-2026-10-13-29 stage 2: the GetCourse courses' sections, several videos,
 * files, links and lessons that open on a day of the program
 * (`models/lesson.ts`), and the course's Telegram links, stream start and
 * access length (`models/course.ts`). Additive only: every existing row keeps
 * the new columns null, which reads as before (one group, open at once, no
 * files, no limit shown).
 */
export class Migration20261013150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "lesson" add column if not exists "section" text null, add column if not exists "section_order" integer null, add column if not exists "cover_url" text null, add column if not exists "summary" text null, add column if not exists "videos" jsonb null, add column if not exists "attachments" jsonb null, add column if not exists "links" jsonb null, add column if not exists "available_from_day" integer null, add column if not exists "metadata" jsonb null;`);
    this.addSql(`alter table if exists "course" add column if not exists "telegram_channel_url" text null, add column if not exists "telegram_chat_url" text null, add column if not exists "start_date" timestamptz null, add column if not exists "access_days" integer null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "lesson" drop column if exists "section", drop column if exists "section_order", drop column if exists "cover_url", drop column if exists "summary", drop column if exists "videos", drop column if exists "attachments", drop column if exists "links", drop column if exists "available_from_day", drop column if exists "metadata";`);
    this.addSql(`alter table if exists "course" drop column if exists "telegram_channel_url", drop column if exists "telegram_chat_url", drop column if exists "start_date", drop column if exists "access_days";`);
  }

}
