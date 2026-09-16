import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * b18-blog-full: the journal grows a real publication state.
 *
 * `tenant_article.published` (boolean, t10-blog) becomes `status`
 * (`draft` | `published` | `scheduled`), and the article gains a `category`
 * and an `author`.
 *
 * ORDER MATTERS AND IS NOT THE GENERATED ONE. `medusa db:generate` emitted the
 * `drop column "published"` BEFORE the `add column "status"`, which would have
 * turned every published article on every stand into a draft without an error
 * to show for it. The three steps below are add → BACKFILL → drop, so the state
 * of a live row survives the migration; `down()` carries it back the same way.
 *
 * Measured both ways on the stand `upready_store_b18` (2026-09-16): three rows
 * (`published`, `draft`, future-`scheduled`) → `db:rollback tenant` → `t/f/f`
 * in the restored boolean → `db:migrate` → `published/draft/draft`. A row that
 * was scheduled for the FUTURE comes back a draft, because a boolean has no
 * third value to carry it in; a scheduled row already DUE comes back published,
 * which is what a visitor saw. That is the whole loss `down()` can have, and it
 * is the safe direction: nothing becomes public that was not.
 *
 * Applied on a live database only after `pg_dump` (rule 42e / protected-infra
 * memo for `upready-store-mt-platform`).
 */
export class Migration20260916090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_article" add column if not exists "status" text not null default 'draft', add column if not exists "category" text null, add column if not exists "author" text null;`,
    );
    // The backfill the generator does not write: a published row stays public.
    this.addSql(
      `update "tenant_article" set "status" = 'published' where "published" = true;`,
    );

    this.addSql(`drop index if exists "IDX_tenant_article_tenant_id_published_published_at";`);
    this.addSql(`alter table if exists "tenant_article" drop column if exists "published";`);
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_article_tenant_id_status_published_at" ON "tenant_article" ("tenant_id", "status", "published_at") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_article" add column if not exists "published" boolean not null default false;`,
    );
    // A scheduled row that is already due was public, so it comes back public.
    this.addSql(
      `update "tenant_article" set "published" = true where "status" = 'published' or ("status" = 'scheduled' and "published_at" is not null and "published_at" <= now());`,
    );

    this.addSql(`drop index if exists "IDX_tenant_article_tenant_id_status_published_at";`);
    this.addSql(
      `alter table if exists "tenant_article" drop column if exists "status", drop column if exists "category", drop column if exists "author";`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_article_tenant_id_published_published_at" ON "tenant_article" ("tenant_id", "published", "published_at") WHERE deleted_at IS NULL;`,
    );
  }
}
