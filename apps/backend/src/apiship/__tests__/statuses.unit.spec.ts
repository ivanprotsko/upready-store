import {
  APISHIP_DELIVERED_STATUSES,
  APISHIP_FINAL_STATUSES,
  APISHIP_SHIPPED_STATUSES,
  apishipStatusLabel,
  apishipTrackingUrl,
} from "../statuses";
import { apishipMethodCopy, carrierLabel } from "../carriers";

/**
 * ApiShip's status keys against the three moments a fulfillment records
 * (t-2026-10-14-58). The key list is `GET /lists/statuses` of the test
 * contour, 14.10.2026.
 */
const KEYS = [
  "pending", "uploading", "uploaded", "uploadingError", "onPointIn", "onWay", "onPointOut", "readyForRecipient",
  "delivering", "delivered", "partialReturn", "returnReady", "returning", "returned", "returnedFromDelivery",
  "deliveryCanceled", "problem", "lost", "notApplicable", "unknown",
];

describe("apiship: statuses", () => {
  it("names every key ApiShip lists in the owner's words", () => {
    for (const key of KEYS) {
      expect(apishipStatusLabel(key)).not.toBe(key);
    }
    expect(apishipStatusLabel("somethingNew")).toBe("somethingNew");
    expect(apishipStatusLabel(null)).toBe("Статус неизвестен");
  });

  it("counts the parcel as shipped once the carrier holds it, and never before", () => {
    for (const key of ["pending", "uploading", "uploaded", "uploadingError"]) {
      expect(APISHIP_SHIPPED_STATUSES.has(key)).toBe(false);
    }
    for (const key of ["onPointIn", "onWay", "delivering", "delivered"]) {
      expect(APISHIP_SHIPPED_STATUSES.has(key)).toBe(true);
    }
    expect(APISHIP_DELIVERED_STATUSES.has("delivered")).toBe(true);
    expect(APISHIP_DELIVERED_STATUSES.has("readyForRecipient")).toBe(false);
  });

  it("stops polling only at the end of the road", () => {
    expect([...APISHIP_FINAL_STATUSES].sort()).toEqual(["deliveryCanceled", "delivered", "lost", "returned", "returnedFromDelivery"]);
    expect(APISHIP_FINAL_STATUSES.has("uploadingError")).toBe(false);
  });

  it("takes ApiShip's tracking link first, then the carrier's own page, else nothing", () => {
    expect(apishipTrackingUrl("cdek", "1110019183", "https://www.cdek.ru/ru/tracking/?order_id=1110019183")).toBe(
      "https://www.cdek.ru/ru/tracking/?order_id=1110019183",
    );
    // ApiShip answers the link with an EMPTY order id while the number is pending.
    expect(apishipTrackingUrl("cdek", "1110019183", "https://www.cdek.ru/ru/tracking/?order_id=")).toBe(
      "https://www.cdek.ru/ru/tracking/?order_id=",
    );
    expect(apishipTrackingUrl("cdek", "1110019183", null)).toBe("https://www.cdek.ru/ru/tracking?order_id=1110019183");
    expect(apishipTrackingUrl("rupost", "80080012345678", "")).toBe("https://www.pochta.ru/tracking#80080012345678");
    expect(apishipTrackingUrl("boxberry", "123", null)).toBeNull();
    expect(apishipTrackingUrl("cdek", "", null)).toBeNull();
  });
});

describe("apiship: carriers", () => {
  it("names the two carriers the task is about, and any other by ApiShip's own name", () => {
    expect(carrierLabel("cdek")).toBe("СДЭК");
    expect(carrierLabel("rupost")).toBe("Почта России");
    expect(carrierLabel("halva", "Халва")).toBe("Халва");
    expect(carrierLabel("x5", null)).toBe("x5");
  });

  it("names the checkout cards the way the direct methods are named", () => {
    expect(apishipMethodCopy("cdek", "courier").name).toBe("СДЭК — курьером до двери");
    expect(apishipMethodCopy("cdek", "pickup").name).toBe("СДЭК — пункт выдачи");
    expect(apishipMethodCopy("rupost", "pickup").name).toBe("Почта России — до отделения");
    expect(apishipMethodCopy("rupost", "courier").name).toBe("Почта России — курьером до двери");
    expect(apishipMethodCopy("boxberry", "pickup", "Boxberry").name).toBe("Boxberry — пункт выдачи");
  });
});
