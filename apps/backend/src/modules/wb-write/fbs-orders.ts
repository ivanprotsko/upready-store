import type { MarketplaceWriteCall } from "../marketplace-write/types";

/**
 * What the FBS desk is allowed to ask for, and from which state
 * (w23-wb-write-fbs-orders).
 *
 * A sixth check, in front of the five gates of `marketplace-write/execute.ts`
 * and not instead of them. The gates answer "may this shop write at all"; this
 * file answers "does this transition exist on Wildberries", which is a
 * different question and is settled by WB's own status table rather than by
 * our idea of an order lifecycle.
 *
 * Pure on purpose: it takes the mirrored facts and returns either a plan or a
 * refusal, so `__tests__/fbs-orders.unit.spec.ts` covers every transition
 * without a database, a key or a network.
 *
 * The status table, verbatim from the page (saved copy:
 * artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-orders-fbs.txt,
 * "Get Assembly Orders Statuses"):
 *
 *   new       "New order"
 *   confirm   "In assembly" — reached by "Add assembly orders to the supply"
 *   complete  "In delivery" — reached by "Transfer the supply to delivery"
 *   cancel    "Canceled by seller" — reached by "Cancel the order"
 *   cancel_carrier  "Canceled by carrier … Changed by the carrier"
 *
 * Note what is NOT there: a method that confirms an order on its own. On WB
 * «Собрать» IS adding the order to a supply, which is why `assemble` below
 * plans two calls where the shop has no open supply yet.
 */

export const FBS_ORDERS_DOC =
  "https://dev.wildberries.ru/en/docs/openapi/orders-fbs#tag/assemblyOrders";
export const FBS_SUPPLIES_DOC =
  "https://dev.wildberries.ru/en/docs/openapi/orders-fbs#tag/supplies";

/** WB's `supplierStatus`, the one the seller moves. */
export const FBS_SUPPLIER_STATUSES = [
  "new",
  "confirm",
  "complete",
  "cancel",
  "cancel_carrier",
] as const;

export type FbsSupplierStatus = (typeof FBS_SUPPLIER_STATUSES)[number];

/** What the panel offers. Each maps onto registered mutations, never onto a path. */
export const FBS_ACTIONS = ["assemble", "cancel", "deliver"] as const;

export type FbsAction = (typeof FBS_ACTIONS)[number];

/** The mirrored order, reduced to what a transition depends on. */
export type FbsOrderFacts = {
  /** WB's assembly order id, an int64 held as text in the mirror. */
  order_id: string;
  supplier_status: string | null;
  wb_status: string | null;
  supply_id: string | null;
  /**
   * WB's own `isCancellable` from the status method, mirrored as it came. A
   * `null` means the mirror has not asked, which is NOT the same as `false`
   * and is not treated as one (rule 20a).
   */
  is_cancellable: boolean | null;
};

/** The mirrored supply, same reduction. */
export type FbsSupplyFacts = {
  supply_id: string;
  /** WB's `done`: the supply has been handed over and is closed. */
  done: boolean;
  /** How many mirrored orders point at this supply. */
  orders: number;
};

/** One planned mutation: an id of `WB_WRITE_ENDPOINTS` and its call. */
export type FbsPlannedCall = { endpointId: string; call: MarketplaceWriteCall };

/**
 * A transition WB does not have. Thrown before the write core is entered at
 * all, so an impossible action never produces an audit row claiming a shop
 * tried to do something reasonable.
 */
export class FbsTransitionError extends Error {
  readonly action: FbsAction;
  readonly subject: string;
  readonly docUrl: string;

  constructor(action: FbsAction, subject: string, message: string, docUrl: string) {
    super(message);
    this.name = "FbsTransitionError";
    this.action = action;
    this.subject = subject;
    this.docUrl = docUrl;
  }
}

/** Statuses from which an order can still be added to (or moved between) supplies. */
const ASSEMBLABLE: ReadonlySet<string> = new Set<FbsSupplierStatus>(["new", "confirm"]);

/**
 * Statuses from which the seller can still cancel. WB: "You can cancel an
 * assembly order before it is handed over to Wildberries", and handing over is
 * what moves an order to `complete`.
 */
const CANCELLABLE: ReadonlySet<string> = new Set<FbsSupplierStatus>(["new", "confirm"]);

const nameStatus = (status: string | null): string => status ?? "неизвестен в зеркале";

/**
 * Why this order cannot be assembled, or `null` when it can.
 *
 * Exported because the panel needs the SAME answer to decide whether a button
 * is offered at all: a rule that lives in two places drifts, and the half that
 * drifts is always the one the user sees (rule 20).
 */
export const assembleRefusal = (order: FbsOrderFacts): string | null => {
  if (!ASSEMBLABLE.has(order.supplier_status ?? "")) {
    return (
      `статус «${nameStatus(order.supplier_status)}»: в поставку принимаются только заказы ` +
      "в статусе new или confirm"
    );
  }
  if (!Number.isSafeInteger(Number(order.order_id))) {
    return `идентификатор ${order.order_id} не целое число, а WB ждёт int64`;
  }
  return null;
};

/** Why this order cannot be cancelled, or `null` when it can. */
export const cancelRefusal = (order: FbsOrderFacts): string | null => {
  if (!CANCELLABLE.has(order.supplier_status ?? "")) {
    return (
      `статус «${nameStatus(order.supplier_status)}»: отменить можно только до передачи ` +
      "заказа в Wildberries"
    );
  }
  if (order.is_cancellable === false) {
    return "Wildberries отвечает isCancellable=false по этому заказу";
  }
  if (!Number.isSafeInteger(Number(order.order_id))) {
    return `идентификатор ${order.order_id} не целое число, а WB ждёт int64`;
  }
  return null;
};

/**
 * Plans «Собрать»: the orders end in WB's `confirm` status.
 *
 * `supply` is the open supply the shop wants them in. Where there is none the
 * caller passes `null` and gets a two-step plan, because WB has no other way
 * to confirm an order (see the head comment).
 */
export const planAssemble = (
  orders: readonly FbsOrderFacts[],
  supply: FbsSupplyFacts | null,
  supplyName: string,
): FbsPlannedCall[] => {
  if (!orders.length) {
    throw new FbsTransitionError(
      "assemble",
      "-",
      "Не выбран ни один заказ.",
      FBS_SUPPLIES_DOC,
    );
  }

  if (orders.length > 100) {
    throw new FbsTransitionError(
      "assemble",
      "-",
      `WB принимает не более 100 заказов за один вызов, выбрано ${orders.length}.`,
      FBS_SUPPLIES_DOC,
    );
  }

  for (const order of orders) {
    const refusal = assembleRefusal(order);
    if (refusal) {
      throw new FbsTransitionError(
        "assemble",
        order.order_id,
        `Заказ ${order.order_id}: ${refusal}.`,
        FBS_SUPPLIES_DOC,
      );
    }
  }

  if (supply?.done) {
    throw new FbsTransitionError(
      "assemble",
      supply.supply_id,
      `Поставка ${supply.supply_id} уже передана в доставку: «You cannot add any assembly orders ` +
        'to the supply after it is closed».',
      FBS_SUPPLIES_DOC,
    );
  }

  const ids = orders.map((order) => Number(order.order_id));

  const plan: FbsPlannedCall[] = [];

  if (!supply) {
    plan.push({
      endpointId: "wb.fbs.supply.create",
      call: { body: { name: supplyName } },
    });
  }

  plan.push({
    endpointId: "wb.fbs.supply.add-orders",
    call: {
      // With no open supply the id is not known until the first call answers.
      // The placeholder is what a DRY RUN can honestly show: today nothing is
      // sent, so there is no 201 to read an id out of (rule 17a).
      params: { supplyId: supply?.supply_id ?? "<id новой поставки>" },
      body: { orders: ids },
    },
  });

  return plan;
};

/** Plans «Отменить»: one call per order, since WB's cancel takes one id in the path. */
export const planCancel = (orders: readonly FbsOrderFacts[]): FbsPlannedCall[] => {
  if (!orders.length) {
    throw new FbsTransitionError("cancel", "-", "Не выбран ни один заказ.", FBS_ORDERS_DOC);
  }

  return orders.map((order) => {
    const refusal = cancelRefusal(order);
    if (refusal) {
      throw new FbsTransitionError(
        "cancel",
        order.order_id,
        `Заказ ${order.order_id}: ${refusal}.`,
        FBS_ORDERS_DOC,
      );
    }

    return {
      endpointId: "wb.fbs.order.cancel",
      call: { params: { orderId: Number(order.order_id) } },
    };
  });
};

/** Plans «Передать в доставку»: closes the supply, which is irreversible. */
export const planDeliver = (supply: FbsSupplyFacts | null): FbsPlannedCall[] => {
  if (!supply) {
    throw new FbsTransitionError(
      "deliver",
      "-",
      "Поставка не выбрана.",
      FBS_SUPPLIES_DOC,
    );
  }

  if (supply.done) {
    throw new FbsTransitionError(
      "deliver",
      supply.supply_id,
      `Поставка ${supply.supply_id} уже закрыта.`,
      FBS_SUPPLIES_DOC,
    );
  }

  if (supply.orders < 1) {
    throw new FbsTransitionError(
      "deliver",
      supply.supply_id,
      `В поставке ${supply.supply_id} нет ни одного заказа: «You can transfer the supply to ` +
        'delivery only if there is at least one assembly order».',
      FBS_SUPPLIES_DOC,
    );
  }

  return [
    { endpointId: "wb.fbs.supply.deliver", call: { params: { supplyId: supply.supply_id } } },
  ];
};

/** The one entry point the route uses, so a new action cannot skip the check. */
export const planFbsAction = (input: {
  action: FbsAction;
  orders: readonly FbsOrderFacts[];
  supply: FbsSupplyFacts | null;
  supplyName: string;
}): FbsPlannedCall[] => {
  switch (input.action) {
    case "assemble":
      return planAssemble(input.orders, input.supply, input.supplyName);
    case "cancel":
      return planCancel(input.orders);
    case "deliver":
      return planDeliver(input.supply);
    default: {
      // Unreachable while `FbsAction` is the only source of actions, and a
      // compile error the moment somebody widens it without widening this.
      const exhaustive: never = input.action;
      throw new FbsTransitionError(
        exhaustive,
        "-",
        `Неизвестное действие ${String(exhaustive)}.`,
        FBS_ORDERS_DOC,
      );
    }
  }
};
