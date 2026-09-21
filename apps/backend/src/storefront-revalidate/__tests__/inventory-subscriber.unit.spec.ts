import {
  InventoryLevelWorkflowEvents,
  ReservationItemWorkflowEvents,
} from "@medusajs/framework/utils";
import handler, { config } from "../../subscribers/inventory-updated";

/**
 * A stock change has to reach the storefront, which caches
 * `+variants.inventory_quantity` with `force-cache`. The expected names come
 * from Medusa's own workflow event constants, not from the subscriber.
 */
describe("inventory-updated subscriber", () => {
  const ORIGINAL_ENV = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = jest.spyOn(global, "fetch" as never);
    process.env.STOREFRONT_URL = "https://store.example.com";
    delete process.env.STOREFRONT_REVALIDATE_URL;
    (fetchSpy as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  const sentBody = () => JSON.parse((fetchSpy as jest.Mock).mock.calls[0][1].body);

  it("listens to every workflow event that changes the quantity a variant can sell", () => {
    expect([...(config.event as string[])].sort()).toEqual(
      [
        InventoryLevelWorkflowEvents.CREATED,
        InventoryLevelWorkflowEvents.UPDATED,
        InventoryLevelWorkflowEvents.DELETED,
        ReservationItemWorkflowEvents.CREATED,
        ReservationItemWorkflowEvents.UPDATED,
        ReservationItemWorkflowEvents.DELETED,
      ].sort(),
    );
  });

  // The storefront's table of events (`app/api/revalidate/clearings.ts`) is
  // keyed by these literals, and its test reads this subscriber as text.
  it("sends the names the storefront's table is keyed by", () => {
    expect([...(config.event as string[])].sort()).toEqual([
      "inventory-level.created",
      "inventory-level.deleted",
      "inventory-level.updated",
      "reservation-item.created",
      "reservation-item.deleted",
      "reservation-item.updated",
    ]);
  });

  it("posts the event to the storefront revalidate webhook", async () => {
    await handler({
      event: { name: InventoryLevelWorkflowEvents.UPDATED, data: { id: "ilev_1" } },
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy as jest.Mock).mock.calls[0][0]).toBe(
      "https://store.example.com/api/revalidate",
    );
    expect(sentBody()).toEqual({ type: InventoryLevelWorkflowEvents.UPDATED, id: "ilev_1" });
  });

  it("reads the list of ids core flows hand to these events", async () => {
    await handler({
      event: {
        name: ReservationItemWorkflowEvents.CREATED,
        data: [{ id: "resitem_1" }, { id: "resitem_2" }],
      },
    } as never);

    expect(sentBody()).toEqual({ type: ReservationItemWorkflowEvents.CREATED, id: "resitem_1" });
  });
});
