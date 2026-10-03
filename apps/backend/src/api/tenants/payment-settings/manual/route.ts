import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { randomBytes } from "node:crypto";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantManualPaymentBody } from "../../validators";
import {
  hasManagerContact,
  legacyManualPayment,
  type PaymentRequisite,
  readManualPayment,
  storedManualPayment,
  type TenantManualPayment,
} from "./manual-payment";
import { PAYMENT_ICON_PRESETS } from "./presets";

/**
 * `GET/PUT /tenants/payment-settings/manual` (olavka-payments) — the shop's
 * transfer requisites and manager contacts for the built-in
 * `pp_system_default` provider. Stored in `tenant.metadata.manual_payment`,
 * merged into the rest of the metadata on every write, so this route never
 * overwrites `branding`, `analytics` or any other key of the document.
 *
 * t-cherk-com-hotfix batch 6: one ordered list of bank and crypto items
 * (`manual-payment.ts`). Both verbs answer `{ manual_payment, presets }`:
 * the document and the icon presets the panel's picker offers.
 *
 * Nothing here is captured automatically. The order a buyer places stays
 * «awaiting payment» until the owner captures it in the panel
 * (`api/tenants/payments/[id]/capture`), which is the whole point of an
 * offline method.
 */
const respond = (res: MedusaResponse, metadata: Record<string, unknown> | null) =>
  res.json({ manual_payment: readManualPayment(metadata), presets: PAYMENT_ICON_PRESETS });

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  respond(res, tenant.metadata as Record<string, unknown> | null);
};

const newId = () => `rq_${randomBytes(6).toString("hex")}`;

/** The body's list with an id on every item: the one it came with, or a new one; never two alike. */
const withIds = (items: NonNullable<PutTenantManualPaymentBody["requisites"]>): PaymentRequisite[] => {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = item.id ?? newId();
    while (seen.has(id)) {
      id = newId();
    }
    seen.add(id);
    return item.kind === "bank"
      ? { id, kind: "bank", icon: item.icon ?? null, bank: item.bank, number: item.number, holder: item.holder ?? null }
      : { id, kind: "crypto", currency: item.currency, network: item.network, address: item.address };
  });
};

/**
 * A panel build from before the list sends `crypto { enabled, wallets }` and
 * `manager { enabled, cards?, contacts }`. They are laid over the current
 * document's own two sections and read back into a list, the way a stored
 * document of that shape is read.
 */
const fromLegacyBody = (body: PutTenantManualPaymentBody, current: TenantManualPayment): TenantManualPayment => {
  const legacy = legacyManualPayment(current);
  const crypto = body.crypto ?? { enabled: current.enabled, wallets: legacy.crypto.wallets };
  const manager = body.manager
    ? { ...body.manager, cards: body.manager.cards ?? legacy.manager.cards }
    : { ...legacy.manager, enabled: current.enabled };

  return readManualPayment({ manual_payment: { crypto, manager } });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantManualPaymentBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = readManualPayment(metadata);
  const body = req.validatedBody;

  const isListBody = body.enabled !== undefined || body.requisites !== undefined || body.contacts !== undefined;

  const next: TenantManualPayment =
    isListBody || (!body.crypto && !body.manager)
      ? {
          enabled: body.enabled ?? current.enabled,
          requisites: body.requisites ? withIds(body.requisites) : current.requisites,
          contacts: body.contacts
            ? {
                whatsapp: body.contacts.whatsapp ?? null,
                telegram: body.contacts.telegram ?? null,
                email: body.contacts.email ?? null,
                note: body.contacts.note ?? null,
              }
            : current.contacts,
        }
      : fromLegacyBody(body, current);

  if (next.enabled && next.requisites.length === 0 && !hasManagerContact(next.contacts)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Add at least one requisite or a manager contact before switching transfers on",
    );
  }

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, manual_payment: storedManualPayment(next) },
  });

  respond(res, updated.metadata as Record<string, unknown> | null);
};
