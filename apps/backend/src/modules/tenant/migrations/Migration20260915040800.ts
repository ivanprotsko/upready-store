import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t05-page-keys: `tenant_page.key` stops being one of five fixed words and
 * becomes a free slug (`PAGE_SLUG_PATTERN` in the model); the five keep their
 * old meaning as reserved slugs. Two columns let the panel say whether a page
 * belongs in the footer and in what order: `in_footer` defaults to `false` for
 * anything new, and this migration backfills `true` plus the five's own order
 * on every EXISTING row, because before this change every published row of
 * theirs was shown in the footer unconditionally.
 */
export class Migration20260915040800 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_page" add column if not exists "in_footer" boolean not null default false;`);
    this.addSql(`alter table if exists "tenant_page" add column if not exists "footer_order" integer null;`);

    this.addSql(`update "tenant_page" set "in_footer" = true, "footer_order" = case "key"
      when 'contacts' then 0
      when 'legal' then 1
      when 'about' then 2
      when 'privacy' then 3
      when 'offer' then 4
      else "footer_order"
    end;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_page" drop column if exists "footer_order";`);
    this.addSql(`alter table if exists "tenant_page" drop column if exists "in_footer";`);
  }

}
