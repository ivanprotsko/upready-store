// The access letter (batch 5) reaches `tenant-notifications/shop.ts`, which
// imports two module links; `defineLink` needs a booted Medusa, so they are
// stubbed the way the other subscriber specs stub them.
jest.mock("../../links/tenant-sales-channel", () => ({ __esModule: true, default: {} }));
jest.mock("../../links/tenant-order", () => ({ __esModule: true, default: { entryPoint: "tenant_order" } }));

import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../modules/course";
import grantCourseOnPaidHandler from "../grant-course-on-paid";

type FakeOrder = {
  id: string;
  customer_id: string | null;
  items: Array<{ product_id: string | null }>;
};

const buildContainer = (opts: {
  order: FakeOrder | null;
  courses: Array<{ id: string; tenant_id: string; product_id: string }>;
  existingEntitlements?: Array<{ id: string; course_id: string; order_id: string | null }>;
}) => {
  const createCourseEntitlements = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const query = {
    graph: jest.fn(async () => ({
      data: opts.order
        ? [{ payment_collection: { order: opts.order } }]
        : [{ payment_collection: undefined }],
    })),
  };

  const courseService = {
    listCourses: jest.fn(async () => opts.courses),
    listCourseEntitlements: jest.fn(async () => opts.existingEntitlements ?? []),
    createCourseEntitlements,
  };

  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger;
      if (key === ContainerRegistrationKeys.QUERY) return query;
      if (key === COURSE_MODULE) return courseService;
      throw new Error(`unexpected resolve(${key})`);
    },
  };

  return { container, createCourseEntitlements, logger, courseService };
};

describe("grant-course-on-paid", () => {
  it("grants an entitlement for the course sold under the paid order's product", async () => {
    const { container, createCourseEntitlements } = buildContainer({
      order: { id: "order_1", customer_id: "cus_1", items: [{ product_id: "prod_course" }] },
      courses: [{ id: "crs_1", tenant_id: "ten_1", product_id: "prod_course" }],
    });

    await grantCourseOnPaidHandler({
      event: { name: "payment.captured", data: { id: "pay_1" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createCourseEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "ten_1",
        customer_id: "cus_1",
        course_id: "crs_1",
        order_id: "order_1",
        status: "active",
      }),
    );
  });

  it("is idempotent: does not grant twice for the same order and course", async () => {
    const { container, createCourseEntitlements } = buildContainer({
      order: { id: "order_1", customer_id: "cus_1", items: [{ product_id: "prod_course" }] },
      courses: [{ id: "crs_1", tenant_id: "ten_1", product_id: "prod_course" }],
      existingEntitlements: [{ id: "cent_1", course_id: "crs_1", order_id: "order_1" }],
    });

    await grantCourseOnPaidHandler({
      event: { name: "payment.captured", data: { id: "pay_1" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createCourseEntitlements).not.toHaveBeenCalled();
  });

  it("grants nothing for an order with no course product", async () => {
    const { container, createCourseEntitlements } = buildContainer({
      order: { id: "order_1", customer_id: "cus_1", items: [{ product_id: "prod_regular" }] },
      courses: [],
    });

    await grantCourseOnPaidHandler({
      event: { name: "payment.captured", data: { id: "pay_1" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createCourseEntitlements).not.toHaveBeenCalled();
  });

  it("skips a paid order with no customer rather than granting to nobody", async () => {
    const { container, createCourseEntitlements } = buildContainer({
      order: { id: "order_1", customer_id: null, items: [{ product_id: "prod_course" }] },
      courses: [{ id: "crs_1", tenant_id: "ten_1", product_id: "prod_course" }],
    });

    await grantCourseOnPaidHandler({
      event: { name: "payment.captured", data: { id: "pay_1" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createCourseEntitlements).not.toHaveBeenCalled();
  });

  it("does nothing when the payment carries no linked order", async () => {
    const { container, createCourseEntitlements } = buildContainer({ order: null, courses: [] });

    await grantCourseOnPaidHandler({
      event: { name: "payment.captured", data: { id: "pay_1" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createCourseEntitlements).not.toHaveBeenCalled();
  });
});
