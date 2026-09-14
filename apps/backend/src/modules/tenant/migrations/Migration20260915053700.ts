import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915053700 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_article" drop constraint if exists "tenant_article_tenant_id_slug_locale_unique";`);
    this.addSql(`create table if not exists "tenant_article" ("id" text not null, "slug" text not null, "locale" text not null default 'en', "title" text not null, "excerpt" text null, "cover_url" text null, "body" text not null default '', "published" boolean not null default false, "published_at" timestamptz null, "tags" text[] null, "seo_title" text null, "seo_description" text null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_article_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_article_tenant_id" ON "tenant_article" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_article_deleted_at" ON "tenant_article" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_article_tenant_id_slug_locale_unique" ON "tenant_article" ("tenant_id", "slug", "locale") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_article_tenant_id_published_published_at" ON "tenant_article" ("tenant_id", "published", "published_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tenant_article" add constraint "tenant_article_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_article" cascade;`);
  }

}
