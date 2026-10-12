import { createHash } from "node:crypto";

import {
  askRobokassaOpState,
  parseRobokassaOpState,
  robokassaOpStateVerdict,
  ROBOKASSA_OP_STATE_URL,
} from "../op-state";

/**
 * t-2026-10-12-13: `OpStateExt` decides a live modal payment at the buyer's
 * return. The documents follow the structure docs.robokassa.ru/ru/xml-interfaces
 * gives for `OperationStateResponse` (read 12.10.2026); the method does not see
 * test payments, so no answer here is a measured one.
 */

const answer = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<OperationStateResponse xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://merchant.roboxchange.com/WebService/">${body}</OperationStateResponse>`;

const paid = answer(`
  <Result><Code>0</Code></Result>
  <State><Code>100</Code><RequestDate>2026-10-12T15:40:00+03:00</RequestDate><StateDate>2026-10-12T15:39:58+03:00</StateDate></State>
  <Info>
    <IncCurrLabel>BankCardPSR</IncCurrLabel><IncSum>1740.000000</IncSum><IncAccount>411111******1111</IncAccount>
    <PaymentMethod><Code>BankCard</Code><Description>Банковская карта</Description></PaymentMethod>
    <OutCurrLabel>BNR</OutCurrLabel><OutSum>1687.800000</OutSum><OpKey>F1E2</OpKey><BankCardRRN>123</BankCardRRN>
  </Info>
  <UserField><Field><Name>Shp_SessionID</Name><Value>payses_1</Value></Field></UserField>`);

describe("parseRobokassaOpState", () => {
  it("reads the result code, the state and both sums", () => {
    expect(parseRobokassaOpState(paid)).toEqual({
      resultCode: 0,
      stateCode: 100,
      incSum: "1740.000000",
      outSum: "1687.800000",
    });
  });

  it("reads an answer without a State, the way Robokassa answers an unknown invoice", () => {
    expect(parseRobokassaOpState(answer("<Result><Code>3</Code><Description>not found</Description></Result>"))).toEqual({
      resultCode: 3,
      stateCode: null,
      incSum: null,
      outSum: null,
    });
  });

  it("reads nothing out of a page that is not the document", () => {
    expect(parseRobokassaOpState("<html>Service Unavailable</html>")).toEqual({
      resultCode: null,
      stateCode: null,
      incSum: null,
      outSum: null,
    });
  });
});

describe("robokassaOpStateVerdict", () => {
  it("is paid at state 100 with the invoiced sum, the buyer's sum or the credited one", () => {
    expect(robokassaOpStateVerdict(parseRobokassaOpState(paid), "1740.00")).toBe("paid");
    expect(
      robokassaOpStateVerdict({ resultCode: 0, stateCode: 100, incSum: "1800.00", outSum: "1740.00" }, "1740.00"),
    ).toBe("paid");
  });

  it("is not paid for another sum, however final the state", () => {
    expect(robokassaOpStateVerdict(parseRobokassaOpState(paid), "1740.01")).toBe("unknown");
  });

  it("is not paid when Robokassa does not know the invoice, cancelled or refused it", () => {
    expect(robokassaOpStateVerdict({ resultCode: 3, stateCode: null, incSum: null, outSum: null }, "1.00")).toBe(
      "not_paid",
    );
    expect(robokassaOpStateVerdict({ resultCode: 0, stateCode: 10, incSum: null, outSum: null }, "1.00")).toBe(
      "not_paid",
    );
    expect(robokassaOpStateVerdict({ resultCode: 0, stateCode: 60, incSum: "1.00", outSum: "1.00" }, "1.00")).toBe(
      "not_paid",
    );
  });

  it("is unknown for a payment on its way, a refused signature or no answer", () => {
    for (const stateCode of [5, 20, 50, 80]) {
      expect(robokassaOpStateVerdict({ resultCode: 0, stateCode, incSum: "1.00", outSum: "1.00" }, "1.00")).toBe(
        "unknown",
      );
    }
    expect(robokassaOpStateVerdict({ resultCode: 1, stateCode: null, incSum: null, outSum: null }, "1.00")).toBe(
      "unknown",
    );
    expect(robokassaOpStateVerdict(null, "1.00")).toBe("unknown");
  });
});

describe("askRobokassaOpState", () => {
  it("signs MerchantLogin:InvoiceID:Password#2 with the shop's algorithm and parses the answer", async () => {
    const asked: string[] = [];
    const state = await askRobokassaOpState({
      merchantLogin: "OLAVKA",
      invoiceId: "1230629747",
      password2: "two",
      algorithm: "sha256",
      fetch: async (url) => {
        asked.push(url);
        return { ok: true, status: 200, text: async () => paid };
      },
    });
    expect(state?.stateCode).toBe(100);
    const url = new URL(asked[0]);
    expect(`${url.origin}${url.pathname}`).toBe(ROBOKASSA_OP_STATE_URL);
    expect(url.searchParams.get("MerchantLogin")).toBe("OLAVKA");
    expect(url.searchParams.get("InvoiceID")).toBe("1230629747");
    expect(url.searchParams.get("Signature")).toBe(
      createHash("sha256").update("OLAVKA:1230629747:two").digest("hex"),
    );
  });

  it("answers null, never «not paid», when Robokassa cannot be asked", async () => {
    const warnings: string[] = [];
    const logger = { warn: (message: string) => warnings.push(message) };
    await expect(
      askRobokassaOpState({
        merchantLogin: "OLAVKA",
        invoiceId: "1",
        password2: "two",
        algorithm: "md5",
        logger,
        fetch: async () => {
          throw new Error("timeout");
        },
      }),
    ).resolves.toBeNull();
    await expect(
      askRobokassaOpState({
        merchantLogin: "OLAVKA",
        invoiceId: "1",
        password2: "two",
        algorithm: "md5",
        logger,
        fetch: async () => ({ ok: false, status: 503, text: async () => "" }),
      }),
    ).resolves.toBeNull();
    expect(warnings).toHaveLength(2);
  });
});
