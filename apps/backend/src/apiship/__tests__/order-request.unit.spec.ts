import { apishipParcel, apishipPhone, apishipRecipient, apishipSender, buildApishipOrderRequest } from "../order-request";
import { emptyApishipCredentials, type ApishipCredentials } from "../../tenant-secrets/apiship";
import type { ApishipShippingMethodData } from "../method";

/**
 * The `POST /orders` body for a Medusa fulfillment (t-2026-10-14-58): what
 * ApiShip receives for the sender, the recipient, the places and the money,
 * and which missing field stops the request.
 */
const credentials = (over: Partial<ApishipCredentials> = {}): ApishipCredentials => ({
  ...emptyApishipCredentials(),
  token: "tok",
  sender_name: "Иванов Иван",
  sender_company: "Черкашино",
  sender_phone: "+7 (925) 000-11-15",
  sender_email: "shop@example.com",
  sender_region: "Москва",
  sender_city: "Москва",
  sender_address: "г Москва, ул Машкова, д 21",
  sender_index: "105062",
  ...over,
});

const methodData = (over: Partial<ApishipShippingMethodData> = {}): ApishipShippingMethodData => ({
  provider: "apiship",
  tenant_id: "ten_1",
  provider_key: "cdek",
  kind: "courier",
  apiship_connection_id: "1700",
  apiship_point_id: null,
  apiship_point_code: null,
  apiship_point_name: null,
  apiship_point_address: null,
  tariff_id: 56,
  tariff_name: "Посылка дверь-дверь",
  period_min: 2,
  period_max: 4,
  term_label: "2-4 дня",
  carrier_amount: 420,
  weight_g: 1700,
  default_weight_g: 500,
  ...over,
});

const order = {
  display_id: 1041,
  email: "buyer@example.com",
  shipping_address: {
    first_name: "Пётр",
    last_name: "Петров",
    phone: "8 (921) 123-45-67",
    address_1: "Невский пр-кт, 1",
    address_2: "кв. 5",
    city: "Санкт-Петербург",
    province: "г Санкт-Петербург",
    postal_code: "191186",
    country_code: "ru",
  },
  items: [
    {
      id: "li_plaid",
      product_title: "Плед",
      variant_title: "Серый",
      variant_sku: "PLED-GREY",
      unit_price: 2500,
      variant: { weight: 700, length: 40, width: 30, height: 10 },
    },
    {
      id: "li_pillow",
      product_title: "Подушка",
      variant_title: "Default variant",
      variant_sku: null,
      unit_price: 999.5,
      variant: { weight: null },
    },
  ],
};

const fulfilled = [
  { line_item_id: "li_plaid", quantity: 2, title: "Серый", sku: "PLED-GREY" },
  { line_item_id: "li_pillow", quantity: 1, title: "Default variant", sku: "" },
];

describe("apiship: phones", () => {
  it("turns a Russian number of any spelling into eleven digits starting with 7", () => {
    expect(apishipPhone("+7 (925) 000-11-15")).toBe("79250001115");
    expect(apishipPhone("8 (921) 123-45-67")).toBe("79211234567");
    expect(apishipPhone("9211234567")).toBe("79211234567");
    expect(apishipPhone("+49 30 123456")).toBe("4930123456");
    expect(apishipPhone("")).toBe("");
    expect(apishipPhone(null)).toBe("");
  });
});

describe("apiship: the parcel", () => {
  it("reads each line off the order by line_item_id, with the shop's default weight for a weightless unit", () => {
    const parcel = apishipParcel(fulfilled, order, 500);
    expect(parcel.items).toEqual([
      {
        description: "Плед, Серый",
        quantity: 2,
        articul: "PLED-GREY",
        assessedCost: 2500,
        cost: 0,
        weight: 700,
        length: 40,
        width: 30,
        height: 10,
      },
      { description: "Подушка", quantity: 1, articul: "li_pillow", assessedCost: 999.5, cost: 0, weight: 500 },
    ]);
    // 2 × 700 + 1 × 500
    expect(parcel.weight).toBe(1900);
    // 2 × 2500 + 999.5
    expect(parcel.assessed_cost).toBe(5999.5);
  });

  it("collects nothing on delivery: every item cost is zero, the value goes to assessedCost", () => {
    const parcel = apishipParcel(fulfilled, order, 500);
    expect(parcel.items.every((item) => item.cost === 0)).toBe(true);
  });
});

describe("apiship: sender and recipient", () => {
  it("builds the sender from the slot and names the first missing field", () => {
    const ok = apishipSender(credentials());
    expect("sender" in ok && ok.sender).toMatchObject({
      countryCode: "RU",
      contactName: "Иванов Иван",
      phone: "79250001115",
      addressString: "г Москва, ул Машкова, д 21",
      companyName: "Черкашино",
      brandName: "Черкашино",
      email: "shop@example.com",
      region: "Москва",
      city: "Москва",
      postIndex: "105062",
    });
    expect(apishipSender(credentials({ sender_name: null }))).toEqual({ missing: "sender_name" });
    expect(apishipSender(credentials({ sender_phone: "" }))).toEqual({ missing: "sender_phone" });
    expect(apishipSender(credentials({ sender_address: null }))).toEqual({ missing: "sender_address" });
  });

  it("builds the recipient from the order address, one line of it, and refuses an order without a phone", () => {
    const ok = apishipRecipient(order.shipping_address, order.email, null);
    expect("recipient" in ok && ok.recipient).toEqual({
      countryCode: "RU",
      contactName: "Пётр Петров",
      phone: "79211234567",
      addressString: "191186, г Санкт-Петербург, Санкт-Петербург, Невский пр-кт, 1, кв. 5",
      email: "buyer@example.com",
      region: "г Санкт-Петербург",
      city: "Санкт-Петербург",
      postIndex: "191186",
    });
    expect(apishipRecipient({ ...order.shipping_address, phone: null }, null, null)).toEqual({ missing: "recipient_phone" });
  });

  it("names the point's address for a delivery to a point, keeping the buyer's name and phone", () => {
    const ok = apishipRecipient(order.shipping_address, null, {
      address: "191040, Санкт-Петербург, пр-т Лиговский, 50",
      city: "Санкт-Петербург",
      region: "Санкт-Петербург",
      postIndex: "191040",
    });
    expect("recipient" in ok && ok.recipient).toMatchObject({
      contactName: "Пётр Петров",
      phone: "79211234567",
      addressString: "191040, Санкт-Петербург, пр-т Лиговский, 50",
      postIndex: "191040",
    });
  });
});

describe("apiship: the whole order request", () => {
  it("assembles order, cost, sender, recipient and one place with the shop's default sides", () => {
    const built = buildApishipOrderRequest({
      methodData: methodData(),
      credentials: credentials(),
      tariffId: 56,
      clientNumber: "1041",
      order,
      items: fulfilled,
      point: null,
      connectionId: "1700",
    });
    expect("request" in built).toBe(true);
    if (!("request" in built)) return;
    expect(built.request.order).toEqual({
      clientNumber: "1041",
      providerKey: "cdek",
      providerConnectId: "1700",
      pickupType: 1,
      deliveryType: 1,
      tariffId: 56,
      weight: 1900,
      length: 30,
      width: 20,
      height: 10,
      description: "Заказ 1041",
    });
    expect(built.request.cost).toEqual({
      assessedCost: 5999.5,
      codCost: 0,
      deliveryCost: 420,
      isDeliveryPayedByRecipient: false,
    });
    expect(built.request.places).toHaveLength(1);
    expect(built.request.places[0]).toMatchObject({ placeNumber: "1", weight: 1900, length: 30, width: 20, height: 10 });
    expect(built.request.places[0].items).toHaveLength(2);
  });

  it("sends pointInId for a shop that brings parcels in, and pointOutId for a delivery to a point", () => {
    const built = buildApishipOrderRequest({
      methodData: methodData({ kind: "pickup", apiship_point_id: 491 }),
      credentials: credentials({ sender_mode: "point", sender_point_id: 333 }),
      tariffId: 53,
      clientNumber: "1042",
      order,
      items: fulfilled,
      point: { address: "191040, Санкт-Петербург, пр-т Лиговский, 50", city: "Санкт-Петербург", region: null, postIndex: "191040" },
    });
    expect("request" in built && built.request.order).toMatchObject({
      pickupType: 2,
      deliveryType: 2,
      pointInId: 333,
      pointOutId: 491,
      tariffId: 53,
    });
  });

  it("stops on the first missing field rather than sending a request ApiShip would refuse", () => {
    expect(
      buildApishipOrderRequest({
        methodData: methodData(),
        credentials: credentials({ sender_phone: null }),
        tariffId: 56,
        clientNumber: "1",
        order,
        items: fulfilled,
        point: null,
      }),
    ).toEqual({ missing: "sender_phone" });
  });
});
