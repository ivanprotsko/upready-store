import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915230613 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`);

    this.addSql(`alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'ozon'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`);

    this.addSql(`alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries'));`);
  }

}
