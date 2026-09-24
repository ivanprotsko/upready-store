import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { linkProductsToSalesChannelWorkflow } from "@medusajs/medusa/core-flows";
import createTenantWorkflow from "../create-tenant";
import applySiteSectionStep from "./steps/apply-site-section";
import copyShippingStep from "./steps/copy-shipping";
import joinGroupStep from "./steps/join-group";
import listEverywhereProductsStep from "./steps/list-everywhere-products";
import readSourceSiteStep from "./steps/read-source-site";

export type CloneTenantWorkflowInput = {
  /** The site being copied: always the caller's current site, never a body field. */
  source_tenant_id: string;
  name: string;
  handle: string;
  /** The owner who asked, who becomes the new site's admin under the same login. */
  admin: { email: string; first_name?: string | null; last_name?: string | null };
  /** Copy the content pages (offer, privacy, contacts and the owner's own). */
  copy_pages: boolean;
  /** Replace the provisioned delivery methods with copies of the source's, tariffs included. */
  copy_shipping: boolean;
};

/**
 * «Создать сайт» (t-2026-09-24-n12, `docs/multitenancy/sites-one-db-many-storefronts.md`
 * §3.4): a second site of the same client, as a new tenant.
 *
 * 1. `createTenantWorkflow` makes the tenant with its own sales channel,
 *    publishable key, warehouse and base zone, and the owner's admin row.
 *    No auth identity is passed, so the owner's login keeps opening the site
 *    it opens today; the new one is one switch away (`POST /tenants/me/switch`).
 * 2. Both sites land in one group, created now if the source had none.
 * 3. The source's site section (`tenant-sites/site-section.ts`, the same
 *    reader the export bundle uses) is written into the new site: locale,
 *    home page and theme, branding/analytics/parcel weight, requisites,
 *    notification settings, product attributes, and pages by flag.
 * 4. Delivery methods with tariffs are copied by flag.
 * 5. Every product the group shows «везде» gets the new site's channel.
 *
 * NOT copied: integration secrets, domains, orders, redirects, handle aliases,
 * products scoped to some sites only. Every step compensates, so a failure
 * anywhere leaves no half-made site behind.
 */
const cloneTenantWorkflow = createWorkflow("clone-tenant", (input: CloneTenantWorkflowInput) => {
  const source = readSourceSiteStep({ tenant_id: input.source_tenant_id });

  const tenantInput = transform({ input }, ({ input }) => ({
    name: input.name,
    handle: input.handle,
    admin: {
      email: input.admin.email,
      first_name: input.admin.first_name ?? undefined,
      last_name: input.admin.last_name ?? undefined,
    },
  }));
  const created = createTenantWorkflow.runAsStep({ input: tenantInput });

  const joinInput = transform({ source, created }, ({ source, created }) => ({
    source_tenant_id: source.tenant_id,
    source_name: source.name,
    source_group_id: source.group_id,
    new_tenant_id: created.tenant.id as string,
  }));
  const group = joinGroupStep(joinInput);

  const applyInput = transform({ source, created, input }, ({ source, created, input }) => ({
    tenant_id: created.tenant.id as string,
    site: source.site,
    pages: input.copy_pages,
  }));
  applySiteSectionStep(applyInput);

  when("copy-shipping", input, (input) => input.copy_shipping).then(() => {
    const shippingInput = transform({ source, created }, ({ source, created }) => ({
      tenant_id: created.tenant.id as string,
      sales_channel_id: created.tenant.sales_channel.id as string,
      stock_locations: source.stock_locations,
    }));
    copyShippingStep(shippingInput);
  });

  const everywhereInput = transform({ group, created }, ({ group, created }) => ({
    group_id: group.group_id,
    exclude_tenant_id: created.tenant.id as string,
  }));
  const everywhere = listEverywhereProductsStep(everywhereInput);

  when("share-everywhere-products", everywhere, (everywhere) => everywhere.product_ids.length > 0).then(() => {
    const linkInput = transform({ everywhere, created }, ({ everywhere, created }) => ({
      id: created.tenant.sales_channel.id as string,
      add: everywhere.product_ids,
    }));
    linkProductsToSalesChannelWorkflow.runAsStep({ input: linkInput });
  });

  return new WorkflowResponse(
    transform({ created, group }, ({ created, group }) => ({
      tenant: { ...created.tenant, group_id: group.group_id },
    })),
  );
});

export default cloneTenantWorkflow;
