import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { guestOrderToken } from "../../../store-order-access/token";
import {
  assertOrderAccess,
  guardOrderTransferRequest,
  scopeOrderListToShop,
} from "../order-access";

/**
 * A publishable key that names no sales channel names no shop
 * (review-2026-09-21 T-2, audit 46df A-17).
 *
 * Every check in `order-access.ts` used to run only `if (channelIds.length)`,
 * so a key that had lost its channel link skipped the shop boundary and the
 * order's own token was enough to read another shop's order. These cases
 * pin the closed answer for all three doors, and keep the two that must stay
 * open (own shop with the token, own shop with the owner's login).
 */

const ORDER = { id: "order_acme_1", customer_id: "cus_owner", sales_channel_id: "sc_acme" };

const requestWith = ({
  channels,
  token,
  actorId,
}: {
  channels: string[] | undefined;
  token?: string;
  actorId?: string;
}) => {
  const graph = jest.fn().mockResolvedValue({ data: [ORDER] });
  return {
    graph,
    req: {
      params: { id: ORDER.id },
      originalUrl: `/store/orders/${ORDER.id}`,
      headers: token ? { "x-order-token": token } : {},
      publishable_key_context: channels ? { key: "pk_test", sales_channel_ids: channels } : undefined,
      auth_context: actorId ? { actor_id: actorId } : undefined,
      queryConfig: { fields: ["id", "email"], pagination: { skip: 0, take: 20 } },
      filterableFields: {},
      scope: {
        resolve: (key: string) => {
          if (key !== ContainerRegistrationKeys.QUERY) {
            throw new Error(`unexpected resolve(${key})`);
          }
          return { graph };
        },
      },
    } as any,
  };
};

const expectNotFound = async (promise: Promise<unknown>) => {
  await expect(promise).rejects.toMatchObject({ type: MedusaError.Types.NOT_FOUND });
};

describe("assertOrderAccess", () => {
  it("refuses a key with no sales channel, even with the order's own token", async () => {
    const { req } = requestWith({ channels: [], token: guestOrderToken(ORDER.id) });
    await expectNotFound(assertOrderAccess(req, ORDER.id));
  });

  it("refuses a request that carries no key context at all", async () => {
    const { req } = requestWith({ channels: undefined, actorId: "cus_owner" });
    await expectNotFound(assertOrderAccess(req, ORDER.id));
  });

  it("refuses another shop's key, even with the order's own token", async () => {
    const { req } = requestWith({ channels: ["sc_globex"], token: guestOrderToken(ORDER.id) });
    await expectNotFound(assertOrderAccess(req, ORDER.id));
  });

  it("serves the order under its own shop's key to the token holder and to the owner", async () => {
    const withToken = requestWith({ channels: ["sc_acme"], token: guestOrderToken(ORDER.id) });
    await expect(assertOrderAccess(withToken.req, ORDER.id)).resolves.toMatchObject({ id: ORDER.id });

    const asOwner = requestWith({ channels: ["sc_acme"], actorId: "cus_owner" });
    await expect(assertOrderAccess(asOwner.req, ORDER.id)).resolves.toMatchObject({ id: ORDER.id });
  });
});

describe("scopeOrderListToShop", () => {
  it("answers an empty list to a key with no sales channel and never reaches the handler", () => {
    const { req } = requestWith({ channels: [], actorId: "cus_owner" });
    const res = { json: jest.fn() } as any;
    const next = jest.fn();

    scopeOrderListToShop(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ orders: [], count: 0, offset: 0, limit: 20 });
  });

  it("narrows the list to the key's own channels", () => {
    const { req } = requestWith({ channels: ["sc_acme"], actorId: "cus_owner" });
    const res = { json: jest.fn() } as any;
    const next = jest.fn();

    scopeOrderListToShop(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(req.filterableFields).toEqual({ sales_channel_id: ["sc_acme"] });
  });
});

describe("guardOrderTransferRequest", () => {
  it("refuses a transfer request under a key with no sales channel", async () => {
    const { req } = requestWith({ channels: [], actorId: "cus_stranger" });
    const next = jest.fn();

    await guardOrderTransferRequest(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ type: MedusaError.Types.NOT_FOUND });
  });

  it("lets a transfer request through under the order's own shop key, trimmed to id and email", async () => {
    const { req } = requestWith({ channels: ["sc_acme"], actorId: "cus_stranger" });
    const next = jest.fn();

    await guardOrderTransferRequest(req, {} as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.queryConfig.fields).toEqual(["id", "email"]);
  });
});
