import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915211004 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_review" drop constraint if exists "product_review_source_check";`);

    this.addSql(`alter table if exists "product_review" add constraint "product_review_source_check" check("source" in ('shop', 'imported', 'wb'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_review" drop constraint if exists "product_review_source_check";`);

    this.addSql(`alter table if exists "product_review" add constraint "product_review_source_check" check("source" in ('shop', 'imported'));`);
  }

}
