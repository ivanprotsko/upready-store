import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t11-seo-redirects step 1: the owner's own meta title/description for a
 * tenant page, alongside the ones already on `tenant_page`.
 */
export class Migration20260916050500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_page" add column if not exists "seo_title" text null;`);
    this.addSql(`alter table if exists "tenant_page" add column if not exists "seo_description" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_page" drop column if exists "seo_title";`);
    this.addSql(`alter table if exists "tenant_page" drop column if exists "seo_description";`);
  }

}
