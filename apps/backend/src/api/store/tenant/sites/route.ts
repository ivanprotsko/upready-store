import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  mergeHreflangSisters,
  readHreflangSistersOverride,
  type HreflangSister,
} from "../../../tenants/hreflang-sisters/hreflang-sisters";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

type GroupMember = {
  id?: string;
  group?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
  domains?: ({ host?: string; is_primary?: boolean } | null)[] | null;
  locale_settings?: { default_locale?: string } | null;
};

/**
 * `GET /store/tenant/sites` (t-cherk-31) — the sister sites this shop's
 * storefront cross-links `hreflang` to: domain and locale only, nothing
 * private (no id, no handle, no sales-channel). Behind the Store API's global
 * publishable-key gate like every other `/store/*` route, which is why this
 * can live under `/store` at all, unlike `/storefront/by-host`
 * (`storefront/by-host/route.ts`'s own comment on why IT cannot).
 *
 * Two sources, merged by `mergeHreflangSisters` (design in
 * `hreflang-sisters.ts`): every OTHER tenant of this one's `tenant_group` that
 * has saved a primary domain and a default locale, plus the owner's own
 * override (`tenant.metadata.hreflang_sisters`, `PUT /tenants/hreflang-sisters`)
 * for a sister that lives outside this database. A tenant with no group and no
 * override — every shop before this feature — answers `{ sites: [] }`, and the
 * storefront then emits exactly what it did before.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [row],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "metadata", "group.id"],
    filters: { id: [tenant.id] },
  });

  const groupId = (row as { group?: { id?: string } | null } | undefined)?.group?.id ?? null;
  const groupDerived: HreflangSister[] = [];

  if (groupId) {
    const { data: members } = await query.graph({
      entity: "tenant",
      fields: [
        "id",
        "group.id",
        "metadata",
        "domains.host",
        "domains.is_primary",
        "locale_settings.default_locale",
      ],
      filters: { group_id: [groupId] } as Record<string, unknown>,
    });

    for (const member of members as GroupMember[]) {
      if (!member.id || member.id === tenant.id || member.group?.id !== groupId) {
        continue;
      }

      if (typeof member.metadata?.["archived_at"] === "string") {
        continue;
      }

      const primaryDomain = (member.domains ?? []).find((domain) => domain?.is_primary && domain.host)
        ?.host;
      const locale = member.locale_settings?.default_locale;

      if (primaryDomain && locale) {
        groupDerived.push({ domain: primaryDomain, locale });
      }
    }
  }

  const override = readHreflangSistersOverride(
    (row as { metadata?: Record<string, unknown> | null } | undefined)?.metadata ?? null,
  );

  res.json({ sites: mergeHreflangSisters(groupDerived, override) });
};
