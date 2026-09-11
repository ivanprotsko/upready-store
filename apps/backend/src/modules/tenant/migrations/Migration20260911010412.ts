import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911010412 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_admin" add column if not exists "metadata" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_admin" drop column if exists "metadata";`);
  }

}
