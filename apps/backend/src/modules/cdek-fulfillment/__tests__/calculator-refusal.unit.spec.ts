import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import CdekFulfillmentService, { CDEK_ADDRESS_REJECTED } from "../service";
import { CdekError, cdekErrorLogLine } from "../../../cdek/client";
import { CDEK_METHOD_SCHEMA } from "../../../cdek/method";

/**
 * t-2026-10-09-56, item 9. On the live shop CDEK's calculator answered 400 for the
 * postcode 80571 (five digits); the error escaped as a plain CdekError, the store API
 * answered 500 «An unknown error occurred», and the log said only «answered 400».
 */

const ADDRESS = {
  address_1: "ул. Ленина, 1",
  city: "Санкт-Петербург",
  postal_code: "80571",
  province: "Санкт-Петербург",
  country_code: "ru",
};

const REFUSAL = new CdekError("CDEK /calculator/tarifflist answered 400", {
  status: 400,
  path: "/calculator/tarifflist",
  errors: [
    { code: "v2_entity_not_found_postal_code", message: "Не найден населённый пункт по индексу 80571 (Санкт-Петербург)" },
  ],
});

const optionData = {
  schema: CDEK_METHOD_SCHEMA,
  tenant_id: "ten_1",
  kind: "pickup",
  tariff_code: null,
  sender_mode: "warehouse",
  default_weight_g: 500,
  markup_amount: 0,
  markup_percent: 0,
  free_above_total: null,
};

class TestService extends CdekFulfillmentService {
  failure: unknown = REFUSAL;

  protected async quote(): Promise<never> {
    throw this.failure;
  }
}

const build = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new TestService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never);
  return { service, logger };
};

const calculate = (service: TestService) =>
  service.calculatePrice(optionData, {}, { shipping_address: ADDRESS, items: [] } as never);

describe("CDEK calculator refusing the address", () => {
  it("answers a clear 400 error with the code the storefront reads, not a 500", async () => {
    const { service } = build();
    const error = await calculate(service).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MedusaError);
    expect((error as MedusaError).type).toBe(MedusaError.Types.INVALID_DATA);
    expect((error as MedusaError).message).toBe(CDEK_ADDRESS_REJECTED);
    expect(CDEK_ADDRESS_REJECTED.startsWith("cdek_address_rejected:")).toBe(true);
  });

  it("logs CDEK's own codes and texts, without the buyer's address", async () => {
    const { service, logger } = build();
    await calculate(service).catch(() => undefined);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const line = String(logger.warn.mock.calls[0][0]);
    expect(line).toContain("CDEK /calculator/tarifflist answered 400");
    expect(line).toContain("v2_entity_not_found_postal_code");
    expect(line).not.toContain("80571");
    expect(line).not.toContain("Санкт-Петербург");
    expect(line).not.toContain("Ленина");
  });

  it("lets a CDEK 5xx, the auth call and any other error go on as they were", async () => {
    const { service, logger } = build();
    const serverError = new CdekError("CDEK /calculator/tarifflist answered 502", { status: 502, path: "/calculator/tarifflist" });
    service.failure = serverError;
    await expect(calculate(service)).rejects.toBe(serverError);

    const auth = new CdekError("CDEK auth failed (401)", { status: 401 });
    service.failure = auth;
    await expect(calculate(service)).rejects.toBe(auth);

    const other = new Error("socket hang up");
    service.failure = other;
    await expect(calculate(service)).rejects.toBe(other);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("cdekErrorLogLine", () => {
  it("joins every CDEK error as code: text and cuts the address parts and long digit runs out", () => {
    const line = cdekErrorLogLine(REFUSAL, [ADDRESS.postal_code, ADDRESS.city]);
    expect(line).toBe(
      "CDEK /calculator/tarifflist answered 400 — v2_entity_not_found_postal_code: Не найден населённый пункт по индексу <адрес> (<адрес>)",
    );
    const noList = new CdekError("CDEK /calculator/tarifflist answered 400", { status: 400 });
    expect(cdekErrorLogLine(noList)).toBe("CDEK /calculator/tarifflist answered 400 — CDEK gave no error list");
    const digits = new CdekError("x", { errors: [{ code: "c", message: "phone 79990001122" }] });
    expect(cdekErrorLogLine(digits)).toBe("x — c: phone <цифры>");
  });
});
