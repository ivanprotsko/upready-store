import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t06-locale-currency: one `tenant_locale_settings` row per tenant, holding the
 * shop's default storefront locale, the subset of the 36 locales it enables,
 * and the country its default prices in.
 */
export class Migration20260915042009 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_locale_settings" ("id" text not null, "default_locale" text not null, "enabled_locales" jsonb not null, "default_country" text null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_locale_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_locale_settings_tenant_id_unique" ON "tenant_locale_settings" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_locale_settings_deleted_at" ON "tenant_locale_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "tenant_locale_settings" add constraint "tenant_locale_settings_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_locale_settings" cascade;`);
  }

}
