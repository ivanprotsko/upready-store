import { isLinkCode, isUsable, LINK_CODE_TTL_MS, expiresAtFrom, generateLinkCode } from "../link-code";
import { formatOrderMessage } from "../order-message";
import { defaultOwnerLocale, ownerText, resolveOwnerLocale } from "../owner-messages";
import { panelOrderUrl, shopOrigin, templateFrom } from "../storefront-origin";
import { botUsername, deepLinkFor } from "../telegram";

/**
 * Unit facts of `src/tenant-notifications` (t08-order-notifications): the
 * customer's link belongs to the SHOP, a link code dies on time, and the
 * owner's message carries what the owner asked for.
 */

describe("tenant-notifications/storefront-origin", () => {
  const BASE_DOMAINS = process.env.TENANT_BASE_DOMAINS;

  afterEach(() => {
    if (BASE_DOMAINS === undefined) {
      delete process.env.TENANT_BASE_DOMAINS;
    } else {
      process.env.TENANT_BASE_DOMAINS = BASE_DOMAINS;
    }
  });

  it("builds the shop's own subdomain on the base the deployment lives on", () => {
    process.env.TENANT_BASE_DOMAINS = "shipshift.dev";
    expect(shopOrigin({ handle: "cherkashino" }, "https://shipshift.dev")).toBe(
      "https://cherkashino.shipshift.dev",
    );
  });

  it("picks the base that covers the stand's own address, not the first configured one", () => {
    // The default list is `upready.dev,localhost`: taking its first entry would
    // mail every stand's customer a link to a domain the stand cannot serve.
    process.env.TENANT_BASE_DOMAINS = "upready.dev,localhost";
    expect(shopOrigin({ handle: "acme" }, "http://localhost:8061")).toBe(
      "http://acme.localhost:8061",
    );
    expect(shopOrigin({ handle: "acme" }, "https://upready.dev")).toBe("https://acme.upready.dev");
  });

  it("prefers the shop's own primary domain, always over https and never on the stand's port", () => {
    expect(
      shopOrigin({ handle: "cherkashino", primaryDomain: "cherkashino.ru" }, "http://localhost:8061"),
    ).toBe("https://cherkashino.ru");
  });

  it("falls back to the global address when no shop is resolved", () => {
    expect(shopOrigin(null, "https://shop.example/")).toBe("https://shop.example");
    expect(shopOrigin({ handle: "" }, "https://shop.example")).toBe("https://shop.example");
  });

  it("treats an unparsable fallback as https without a port instead of throwing", () => {
    process.env.TENANT_BASE_DOMAINS = "upready.dev,localhost";
    expect(templateFrom("not a url")).toEqual({ protocol: "https:", port: "", host: "" });
    expect(shopOrigin({ handle: "acme" }, "not a url")).toBe("https://acme.upready.dev");
  });

  it("gives the panel address of one order, or nothing at all", () => {
    expect(panelOrderUrl("order_1", { PANEL_PUBLIC_URL: "https://panel.shipshift.dev/" })).toBe(
      "https://panel.shipshift.dev/orders/order_1",
    );
    expect(panelOrderUrl("order_1", { DEMO_PANEL_URL: "http://localhost:5191" })).toBe(
      "http://localhost:5191/orders/order_1",
    );
    expect(panelOrderUrl("order_1", {})).toBeNull();
  });
});

describe("tenant-notifications/link-code", () => {
  it("mints a code the bot can recognise", () => {
    const code = generateLinkCode();
    expect(isLinkCode(code)).toBe(true);
    expect(code.startsWith("lk_")).toBe(true);
    expect(generateLinkCode()).not.toBe(code);
  });

  it("refuses anything that is not one, a pricing payload included", () => {
    expect(isLinkCode("plan_2")).toBe(false);
    expect(isLinkCode("")).toBe(false);
    expect(isLinkCode("lk_short")).toBe(false);
    expect(isLinkCode(`lk_${"a".repeat(80)}`)).toBe(false);
  });

  it("is usable before its deadline and dead after it", () => {
    const now = new Date("2026-09-15T04:00:00.000Z");
    const row = { link_code: generateLinkCode(), link_code_expires_at: expiresAtFrom(now) };

    expect(isUsable(row, now)).toBe(true);
    expect(isUsable(row, new Date(now.getTime() + LINK_CODE_TTL_MS - 1000))).toBe(true);
    expect(isUsable(row, new Date(now.getTime() + LINK_CODE_TTL_MS + 1000))).toBe(false);
  });

  it("treats a code without a deadline as dead, not as eternal", () => {
    expect(isUsable({ link_code: "lk_abcdefghij", link_code_expires_at: null }, new Date())).toBe(
      false,
    );
    expect(isUsable({ link_code: null, link_code_expires_at: new Date() }, new Date())).toBe(false);
  });
});

describe("tenant-notifications/telegram", () => {
  it("builds the deep link on the platform bot", () => {
    expect(deepLinkFor("lk_abcdefghij", { TELEGRAM_BOT_USERNAME: "@stand_bot" })).toContain(
      "https://t.me/stand_bot?start=lk_abcdefghij",
    );
    expect(botUsername({})).toBe("upreadystore_bot");
  });
});

describe("tenant-notifications/owner-messages", () => {
  it("speaks the two languages the panel speaks and falls back to English", () => {
    expect(resolveOwnerLocale("ru-RU")).toBe("ru");
    expect(resolveOwnerLocale("de")).toBe("en");
    expect(resolveOwnerLocale(null, "ru")).toBe("ru");
    expect(defaultOwnerLocale({ STOREFRONT_DEFAULT_LOCALE: "ru" })).toBe("ru");
  });

  it("substitutes only named placeholders", () => {
    expect(ownerText("ru", "linked", { shop: "Черкашино" })).toContain("«Черкашино»");
    expect(ownerText("en", "newOrder", { id: 42 })).toBe("New order #42");
  });
});

describe("tenant-notifications/order-message", () => {
  const order = {
    id: "order_01ABC",
    display_id: 1042,
    email: "buyer@example.com",
    currency_code: "rub",
    total: 7500,
    shipping_total: 500,
    items: [
      { title: "Платье «Ирис»", variant_title: "M", quantity: 2, total: 7000 },
    ],
    shipping_methods: [{ name: "Курьер по Москве", amount: 500 }],
    shipping_address: {
      first_name: "Оксана",
      last_name: "Черкашина",
      phone: "+7 900 000-00-00",
      address_1: "ул. Ленина, 1",
      city: "Москва",
      postal_code: "101000",
      country_code: "ru",
    },
  };

  it("carries the shop, the number, the items, the customer and the panel link", () => {
    const text = formatOrderMessage({
      order,
      shopName: "Черкашино",
      locale: "ru",
      panelUrl: "https://panel.shipshift.dev/orders/order_01ABC",
    });

    expect(text).toContain("Новый заказ №1042");
    expect(text).toContain("Магазин: Черкашино");
    expect(text).toContain("Платье «Ирис» / M — 2 шт");
    expect(text).toContain("Курьер по Москве");
    expect(text).toContain("Оксана Черкашина");
    expect(text).toContain("+7 900 000-00-00");
    expect(text).toContain("buyer@example.com");
    expect(text).toContain("Москва");
    expect(text).toContain("https://panel.shipshift.dev/orders/order_01ABC");
  });

  it("omits what the order does not have instead of printing empty labels", () => {
    const text = formatOrderMessage({
      order: { id: "order_2", currency_code: "rub", total: 100 },
      shopName: "Shop",
      locale: "en",
      panelUrl: null,
    });

    expect(text).toContain("New order #order_2");
    expect(text).not.toContain("Phone:");
    expect(text).not.toContain("Open the order");
    expect(text).not.toMatch(/\n{3}/);
  });

  it("prices a line from unit price and quantity when the line total is absent", () => {
    const text = formatOrderMessage({
      order: {
        id: "order_3",
        currency_code: "rub",
        items: [{ title: "Свеча", quantity: 3, unit_price: 200 }],
      },
      shopName: "Shop",
      locale: "en",
      panelUrl: null,
    });

    expect(text).toContain("Свеча — 3 pcs");
    // 3 × 200, whatever the locale's separator looks like
    expect(text.replace(/[ \s]/g, "")).toContain("600");
  });
});
