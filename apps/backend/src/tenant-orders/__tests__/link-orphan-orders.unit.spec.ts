import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * The orphan-order convergence (review-2026-09-21 T-1, audit 46df A-05).
 *
 * The fake Query holds three tables: the channels shops own, the orders and
 * the tenant-order links. The workflow is faked to write a link, the way the
 * real one does, so a second run sees what the first one wrote. The two link
 * definitions are replaced by their entry points, because `defineLink` needs
 * the module loader that only a booted app has.
 */

const tenantOrderLink = { entryPoint: "tenant_order" };
const tenantSalesChannelLink = { entryPoint: "tenant_sales_channel" };
jest.mock("../../links/tenant-order", () => ({
  __esModule: true,
  default: { entryPoint: "tenant_order" },
}));
jest.mock("../../links/tenant-sales-channel", () => ({
  __esModule: true,
  default: { entryPoint: "tenant_sales_channel" },
}));

const runWorkflow = jest.fn();
jest.mock("../../workflows/tenant/link-order-to-tenant", () => ({
  __esModule: true,
  default: () => ({ run: runWorkflow }),
}));

type Order = { id: string; sales_channel_id: string; is_draft_order: boolean; created_at: Date };

const state = {
  ownedChannels: [] as { tenant_id: string; sales_channel_id: string }[],
  orders: [] as Order[],
  links: [] as { tenant_id: string; order_id: string }[],
};

const graphCalls: { entity: string; filters?: Record<string, any> }[] = [];
const graph = jest.fn(async (input: any) => {
  graphCalls.push({ entity: input.entity, filters: input.filters });
  if (input.entity === tenantSalesChannelLink.entryPoint) {
    return { data: state.ownedChannels };
  }
  if (input.entity === tenantOrderLink.entryPoint) {
    const ids: string[] = input.filters.order_id;
    return { data: state.links.filter((link) => ids.includes(link.order_id)) };
  }
  if (input.entity === "order") {
    const { sales_channel_id, is_draft_order, created_at } = input.filters;
    const rows = state.orders
      .filter((o) => sales_channel_id.includes(o.sales_channel_id))
      .filter((o) => o.is_draft_order === is_draft_order)
      .filter((o) => !created_at || o.created_at < created_at.$lt)
      .sort((x, y) => x.id.localeCompare(y.id));
    const { skip, take } = input.pagination;
    return { data: rows.slice(skip, skip + take) };
  }
  throw new Error(`unexpected entity ${input.entity}`);
});

const errors: string[] = [];
const warnings: string[] = [];
const logger = {
  info: jest.fn(),
  warn: (message: string) => warnings.push(message),
  error: (message: string) => errors.push(message),
};

const container = {
  resolve: (key: string) => {
    if (key === ContainerRegistrationKeys.QUERY) return { graph };
    if (key === ContainerRegistrationKeys.LOGGER) return logger;
    throw new Error(`unexpected resolve(${key})`);
  },
} as any;

const order = (id: string, channel = "sc_acme", extra: Partial<Order> = {}): Order => ({
  id,
  sales_channel_id: channel,
  is_draft_order: false,
  created_at: new Date("2026-09-20T00:00:00Z"),
  ...extra,
});

beforeEach(() => {
  state.ownedChannels = [{ tenant_id: "ten_acme", sales_channel_id: "sc_acme" }];
  state.orders = [];
  state.links = [];
  graphCalls.length = 0;
  errors.length = 0;
  warnings.length = 0;
  runWorkflow.mockReset();
  runWorkflow.mockImplementation(async ({ input }: { input: { order_id: string } }) => {
    state.links.push({ tenant_id: "ten_acme", order_id: input.order_id });
    return { result: { tenant_id: "ten_acme", linked: true } };
  });
});

const { linkOrphanOrders, describeOrphanOrders } = require("../link-orphan-orders");

describe("linkOrphanOrders", () => {
  it("links only the unlinked orders of shop channels, and a second run finds nothing", async () => {
    state.orders = [
      order("order_1"),
      order("order_2"),
      order("order_3"),
      order("order_nobody", "sc_seed"),
      order("order_draft", "sc_acme", { is_draft_order: true }),
    ];
    state.links = [{ tenant_id: "ten_acme", order_id: "order_2" }];

    const first = await linkOrphanOrders(container);
    expect(first).toEqual({ checked: 3, orphans: 2, linked: 2, failed: [] });
    expect(runWorkflow.mock.calls.map(([{ input }]) => input.order_id)).toEqual(["order_1", "order_3"]);

    runWorkflow.mockClear();
    const second = await linkOrphanOrders(container);
    expect(second).toEqual({ checked: 3, orphans: 0, linked: 0, failed: [] });
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("counts the orphans and links none on a dry run", async () => {
    state.orders = [order("order_1"), order("order_2")];

    const summary = await linkOrphanOrders(container, { dryRun: true });

    expect(summary).toEqual({ checked: 2, orphans: 2, linked: 0, failed: [] });
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(describeOrphanOrders(summary, true)).toBe(
      "[orphan-orders] 2 shop order(s) checked, 2 without a shop link, dry run: nothing linked",
    );
  });

  it("reports an order whose workflow throws and still links the rest", async () => {
    state.orders = [order("order_1"), order("order_2"), order("order_3")];
    runWorkflow.mockImplementationOnce(async () => {
      throw new Error("Order id not found: order_1");
    });

    const summary = await linkOrphanOrders(container);

    expect(summary).toEqual({ checked: 3, orphans: 3, linked: 2, failed: ["order_1"] });
    expect(errors).toEqual([
      "[orphan-orders] order order_1 could not be linked to its shop: Order id not found: order_1",
    ]);
    expect(describeOrphanOrders(summary)).toBe(
      "[orphan-orders] 3 shop order(s) checked, 3 without a shop link, linked 2, failed 1: order_1",
    );
  });

  it("does not read orders at all when no shop owns a sales channel", async () => {
    state.ownedChannels = [];
    state.orders = [order("order_1")];

    const summary = await linkOrphanOrders(container);

    expect(summary).toEqual({ checked: 0, orphans: 0, linked: 0, failed: [] });
    expect(graphCalls.map((call) => call.entity)).toEqual([tenantSalesChannelLink.entryPoint]);
  });

  it("leaves orders placed at or after placedBefore to the subscriber", async () => {
    state.orders = [
      order("order_old", "sc_acme", { created_at: new Date("2026-09-30T00:00:00Z") }),
      order("order_new", "sc_acme", { created_at: new Date("2026-09-30T00:10:00Z") }),
    ];

    const summary = await linkOrphanOrders(container, {
      placedBefore: new Date("2026-09-30T00:05:00Z"),
    });

    expect(summary).toEqual({ checked: 1, orphans: 1, linked: 1, failed: [] });
    expect(state.links.map((link) => link.order_id)).toEqual(["order_old"]);
  });

  it("walks every page of a large order table", async () => {
    state.orders = Array.from({ length: 1203 }, (_, i) => order(`order_${String(i).padStart(4, "0")}`));
    state.links = state.orders.slice(0, 1200).map((o) => ({ tenant_id: "ten_acme", order_id: o.id }));

    const summary = await linkOrphanOrders(container, { dryRun: true });

    expect(summary).toEqual({ checked: 1203, orphans: 3, linked: 0, failed: [] });
  });
});

describe("the link-orphan-orders job", () => {
  it("skips the subscriber's grace window and warns only when it found an orphan", async () => {
    const { default: job, SUBSCRIBER_GRACE_MS, config } = require("../../jobs/link-orphan-orders");
    expect(config).toEqual({ name: "link-orphan-orders", schedule: "*/10 * * * *" });

    const now = Date.now();
    state.orders = [
      order("order_missed", "sc_acme", { created_at: new Date(now - SUBSCRIBER_GRACE_MS - 60_000) }),
      order("order_fresh", "sc_acme", { created_at: new Date(now - 1_000) }),
    ];

    await job(container);
    expect(state.links.map((link) => link.order_id)).toEqual(["order_missed"]);
    expect(warnings).toEqual([
      "[orphan-orders] 1 shop order(s) checked, 1 without a shop link, linked 1",
    ]);

    warnings.length = 0;
    await job(container);
    expect(warnings).toEqual([]);
  });
});
