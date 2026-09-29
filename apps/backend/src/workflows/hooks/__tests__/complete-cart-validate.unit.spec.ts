import fs from "fs";
import path from "path";

type Handler = (input: unknown, ctx: unknown) => Promise<void>;

// `jest.mock` is hoisted above every binding in this file, so the list of
// registered handlers is owned by the factory and read back off the mock.
jest.mock("@medusajs/medusa/core-flows", () => {
  const handlers: Handler[] = [];
  return {
    __handlers: handlers,
    completeCartWorkflow: {
      hooks: { validate: (handler: Handler) => handlers.push(handler) },
    },
    createCartWorkflow: { hooks: { validate: jest.fn() } },
    addToCartWorkflow: { hooks: { validate: jest.fn() } },
  };
});

import "../complete-cart-validate";

const registered = (
  jest.requireMock("@medusajs/medusa/core-flows") as { __handlers: Handler[] }
).__handlers;

const SRC = path.join(__dirname, "..", "..", "..");

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith(".ts") ? [full] : [];
  });

describe("the completion gate", () => {
  /**
   * Medusa refuses to boot on a second handler for the same hook («Cannot
   * define multiple hook handlers for the validate hook»), and nothing but a
   * start catches it: both files typecheck and lint clean on their own.
   */
  it("is registered exactly once in the whole backend", () => {
    const owners = walk(SRC).filter((file) =>
      /completeCartWorkflow\.hooks\.validate\s*\(/.test(
        fs.readFileSync(file, "utf8"),
      ) && !file.includes(`${path.sep}__tests__${path.sep}`),
    );

    expect(owners.map((file) => path.relative(SRC, file))).toEqual([
      path.join("workflows", "hooks", "complete-cart-validate.ts"),
    ]);
  });

  it("runs the three cart rules, sales channel first and the Russian Post point last", async () => {
    expect(registered).toHaveLength(1);

    const calls: string[] = [];
    const container = {
      resolve: () => ({
        graph: async ({ entity }: { entity: string }) => {
          calls.push(entity);
          return { data: [] };
        },
      }),
    };

    await registered[0](
      {
        cart: {
          sales_channel_id: "sc_01",
          items: [{ variant_id: "variant_01" }],
          shipping_address: {
            address_1: "ул. Ленина, д. 1",
            postal_code: "101000",
            city: "Москва",
            province: "г Москва",
            country_code: "ru",
          },
          shipping_methods: [{ shipping_option_id: "so_01" }],
        },
      },
      { container },
    );

    // The address rule reads the option's fulfillment set, the Russian Post
    // rule its provider (validate-cart-pochta-point.ts).
    expect(calls).toEqual(["variant", "shipping_option", "shipping_option"]);
  });
});
