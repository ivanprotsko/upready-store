import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Drafts, their status and the per-tenant answer templates
 * (w22-wb-write-feedback-answers).
 *
 * The mirrors themselves stay read-only copies of what WB shows: nothing here
 * changes `is_answered`, `text` or `raw`. What is added is the shop's OWN
 * side of an answer — the draft she is writing, who confirmed it and what the
 * last attempt came to — because a draft is ours and a review is WB's.
 *
 * `answer_status` is a CHECK constraint rather than free text on purpose: the
 * value `sent` means a request left the process, and a typo that writes it
 * would be a claim nobody could tell from the truth afterwards.
 *
 * The `wb_sync_run` statements the generator also proposed are left out: they
 * belong to `Migration20260916064500` (w03), which already applies them.
 */
export class Migration20260915235004 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "wb_answer_template" drop constraint if exists "wb_answer_template_tenant_id_slug_unique";`,
    );
    this.addSql(
      `create table if not exists "wb_answer_template" ("id" text not null, "tenant_id" text not null, ` +
        `"slug" text not null, "title" text not null, "body" text not null, ` +
        `"target" text check ("target" in ('feedback', 'question', 'both')) not null default 'both', ` +
        `"sort_order" integer not null default 100, "is_builtin" boolean not null default false, ` +
        `"created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, constraint "wb_answer_template_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_wb_answer_template_deleted_at" ON "wb_answer_template" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_answer_template_tenant_id_slug_unique" ON "wb_answer_template" ("tenant_id", "slug") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `alter table if exists "wb_feedback" ` +
        `add column if not exists "draft_answer" text null, ` +
        `add column if not exists "answer_status" text check ("answer_status" in ('draft', 'confirmed', 'sent', 'failed')) not null default 'draft', ` +
        `add column if not exists "answer_sha256" text null, ` +
        `add column if not exists "answer_confirmed_by" text null, ` +
        `add column if not exists "answer_confirmed_at" timestamptz null, ` +
        `add column if not exists "answer_error" text null;`,
    );

    this.addSql(
      `alter table if exists "wb_question" ` +
        `add column if not exists "draft_answer" text null, ` +
        `add column if not exists "answer_status" text check ("answer_status" in ('draft', 'confirmed', 'sent', 'failed')) not null default 'draft', ` +
        `add column if not exists "answer_sha256" text null, ` +
        `add column if not exists "answer_confirmed_by" text null, ` +
        `add column if not exists "answer_confirmed_at" timestamptz null, ` +
        `add column if not exists "answer_error" text null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wb_answer_template" cascade;`);

    this.addSql(
      `alter table if exists "wb_feedback" ` +
        `drop column if exists "draft_answer", drop column if exists "answer_status", ` +
        `drop column if exists "answer_sha256", drop column if exists "answer_confirmed_by", ` +
        `drop column if exists "answer_confirmed_at", drop column if exists "answer_error";`,
    );

    this.addSql(
      `alter table if exists "wb_question" ` +
        `drop column if exists "draft_answer", drop column if exists "answer_status", ` +
        `drop column if exists "answer_sha256", drop column if exists "answer_confirmed_by", ` +
        `drop column if exists "answer_confirmed_at", drop column if exists "answer_error";`,
    );
  }
}
