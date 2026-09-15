import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915211441 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wb_sale" drop constraint if exists "wb_sale_tenant_id_srid_sale_id_unique";`);
    this.addSql(`drop index if exists "IDX_wb_sale_tenant_id_srid_unique";`);

    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_sale_tenant_id_srid_sale_id_unique" ON "wb_sale" ("tenant_id", "srid", "sale_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_wb_sale_tenant_id_srid_sale_id_unique";`);

    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_sale_tenant_id_srid_unique" ON "wb_sale" ("tenant_id", "srid") WHERE deleted_at IS NULL;`);
  }

}
