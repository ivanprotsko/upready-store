import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../../../../../modules/marketplace-write";
import { createMedusaWriteStore } from "../../../../../modules/marketplace-write/medusa-store";
import type MarketplaceWriteModuleService from "../../../../../modules/marketplace-write/service";
import { MarketplaceWriteRefused } from "../../../../../modules/marketplace-write/types";
import { WB_MODULE } from "../../../../../modules/wb";
import type WbModuleService from "../../../../../modules/wb/service";
import {
  FbsTransitionError,
  planFbsAction,
  type FbsOrderFacts,
  type FbsSupplyFacts,
} from "../../../../../modules/wb-write/fbs-orders";
import { WB_MARKETPLACE } from "../../../../../modules/wb-write/write-endpoints";
import { wbWrite } from "../../../../../modules/wb-write/write-transport";
import { getTenantScope } from "../../../tenant-scope";
import type { PostTenantWbFbsActionBodyType } from "../validators";

/**
 * `POST /tenants/wb/fbs-orders/actions` — «Собрать», «Отменить», «Передать в
 * доставку» (w23-wb-write-fbs-orders).
 *
 * The first production caller of `wbWrite` in this repository. It adds NO
 * gate and it removes none: the five of `marketplace-write/execute.ts` decide
 * whether anything leaves the process, and today gate (e) (`WB_WRITE_LIVE=1`,
 * set by no deployment) keeps every answer a dry run. What this route adds in
 * front of them is the sixth question, which is not theirs: does Wildberries
 * HAVE this transition (`modules/wb-write/fbs-orders.ts`).
 *
 * The order of the two checks matters. A transition WB does not have is
 * refused BEFORE the write core is entered, so the journal never fills with
 * rows claiming a shop tried to cancel a delivered order; a transition WB does
 * have is journalled whatever the gates then answer, refusals included.
 *
 * Owner-scoped: the tenant comes from the token (`getTenantScope`), the orders
 * are re-read from OUR mirror by id inside that tenant, and an id that is not
 * in the mirror is a 404 rather than something passed on to WB. A request can
 * therefore not name a stranger's assembly order.
 */

type OrderRow = {
  order_id: string;
  supplier_status: string | null;
  wb_status: string | null;
  supply_id: string | null;
  is_cancellable: boolean | null;
};

type SupplyRow = { supply_id: string; done: boolean };

/** The default name of a supply the desk creates, dated so two are telling apart. */
const supplyNameFor = (now: Date): string =>
  `Поставка ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantWbFbsActionBodyType>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const wb = req.scope.resolve<WbModuleService>(WB_MODULE);
  const service = req.scope.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);

  const orderIds = body.order_ids ?? [];

  const rows = orderIds.length
    ? ((await wb.listWbFbsOrders({
        tenant_id: tenant.id,
        order_id: orderIds,
      })) as OrderRow[])
    : [];

  const missing = orderIds.filter((id) => !rows.some((row) => row.order_id === id));
  if (missing.length) {
    res.status(404).json({
      type: "not_found",
      message:
        `В зеркале этого магазина нет заказов ${missing.join(", ")}. Запустите импорт ` +
        "(WB_KIND=fbs_orders) и повторите — действовать по идентификатору, которого мы не видели, " +
        "эта панель не умеет.",
    });
    return;
  }

  let supply: FbsSupplyFacts | null = null;
  if (body.supply_id) {
    const [row] = (await wb.listWbSupplies({
      tenant_id: tenant.id,
      supply_id: body.supply_id,
    })) as SupplyRow[];

    if (!row) {
      res.status(404).json({
        type: "not_found",
        message: `В зеркале этого магазина нет поставки ${body.supply_id}.`,
      });
      return;
    }

    const [counted] = (await pg("wb_fbs_order")
      .where({ tenant_id: tenant.id, supply_id: body.supply_id })
      .whereNull("deleted_at")
      .count<{ count: string }[]>("* as count")) as Array<{ count: string }>;

    supply = { supply_id: row.supply_id, done: row.done, orders: Number(counted?.count ?? 0) };
  }

  const facts: FbsOrderFacts[] = rows.map((row) => ({
    order_id: row.order_id,
    supplier_status: row.supplier_status,
    wb_status: row.wb_status,
    supply_id: row.supply_id,
    is_cancellable: row.is_cancellable,
  }));

  let plan;
  try {
    plan = planFbsAction({
      action: body.action,
      orders: facts,
      supply,
      supplyName: body.supply_name ?? supplyNameFor(new Date()),
    });
  } catch (error) {
    if (error instanceof FbsTransitionError) {
      // 409 and not 400: the request is well formed, the STATE refuses it.
      res.status(409).json({
        type: "invalid_transition",
        action: error.action,
        subject: error.subject,
        message: error.message,
        doc_url: error.docUrl,
      });
      return;
    }
    throw error;
  }

  const store = createMedusaWriteStore({
    pg,
    service,
    tenantId: tenant.id,
    marketplace: WB_MARKETPLACE,
  });

  const ctx = {
    tenantId: tenant.id,
    actor: req.auth_context.actor_id,
    store,
    logger: req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Pick<Console, "info" | "warn">,
  };

  const results: Array<Record<string, unknown>> = [];

  for (const step of plan) {
    try {
      const result = await wbWrite(step.endpointId, step.call, ctx);
      results.push({
        endpoint_id: result.endpointId,
        op_class: result.opClass,
        method: result.method,
        path: result.path,
        dry_run: result.dryRun,
        payload_sha256: result.payloadSha256,
        status: result.status,
        refused: false,
        gate: null,
        message: null,
      });
    } catch (error) {
      if (error instanceof MarketplaceWriteRefused) {
        results.push({
          endpoint_id: step.endpointId,
          op_class: "fbs_orders",
          method: null,
          path: null,
          dry_run: true,
          payload_sha256: null,
          status: null,
          refused: true,
          gate: error.gate,
          message: error.message,
        });
        // A refusal stops the plan: step 2 of «Собрать» has no supply to add
        // orders to if step 1 never happened. The row is already journalled.
        break;
      }
      throw error;
    }
  }

  const everyStepDry = results.every((step) => step.dry_run === true);

  res.json({
    action: body.action,
    orders: facts.map((order) => order.order_id),
    supply_id: supply?.supply_id ?? null,
    steps: results,
    /**
     * `true` today for every answer this repository can produce. Reported as a
     * read-back of what the steps say, never as a constant (rule 20a).
     */
    dry_run: everyStepDry,
    /**
     * Named rather than left for the reader to notice: with no live mode there
     * is no 201 to take a new supply's id out of, so a two-step «Собрать» ends
     * up journalling a placeholder in the second step's path.
     */
    note:
      body.action === "assemble" && !supply
        ? "Поставка не выбрана: план состоит из двух шагов — создать поставку и добавить в неё " +
          "заказы. Живого режима нет, поэтому идентификатор новой поставки не возвращается и во " +
          "втором шаге журнала стоит заполнитель."
        : null,
  });
};
