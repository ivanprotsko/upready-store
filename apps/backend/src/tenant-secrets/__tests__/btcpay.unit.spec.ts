import { createHmac } from "node:crypto";
import {
  btcpaySignature,
  maskBtcpaySettings,
  missingBtcpayFields,
  normalizeBtcpayServerUrl,
  verifyBtcpaySignature,
} from "../btcpay";

/**
 * ask-20261005-070255-438f: the shop's BTCPay store as stored. `BTCPay-Sig`
 * is checked for real here, against a digest computed independently with
 * `node:crypto`, so a wrong prefix or encoding in `btcpaySignature` cannot
 * pass by agreeing with itself.
 */

const SECRET = "whsec-of-the-store";
const BODY = Buffer.from(JSON.stringify({ type: "InvoiceSettled", invoiceId: "inv_1", storeId: "store_1" }));
const independent = (body: Buffer, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyBtcpaySignature", () => {
  it("accepts the header BTCPay sends: sha256=<hex HMAC of the raw body>", () => {
    expect(btcpaySignature(BODY, SECRET)).toBe(independent(BODY, SECRET));
    expect(verifyBtcpaySignature(BODY, SECRET, independent(BODY, SECRET))).toBe(true);
  });

  it("accepts upper-case hex and surrounding whitespace", () => {
    const header = independent(BODY, SECRET);
    expect(verifyBtcpaySignature(BODY, SECRET, `  sha256=${header.slice(7).toUpperCase()} `)).toBe(true);
  });

  it("refuses another secret, a tampered body and a digest of another body", () => {
    expect(verifyBtcpaySignature(BODY, SECRET, independent(BODY, "someone-elses-secret"))).toBe(false);
    const tampered = Buffer.from(BODY.toString().replace("inv_1", "inv_2"));
    expect(verifyBtcpaySignature(tampered, SECRET, independent(BODY, SECRET))).toBe(false);
  });

  it("refuses a missing, empty, unprefixed, truncated or repeated header without throwing", () => {
    const hex = independent(BODY, SECRET).slice(7);
    expect(verifyBtcpaySignature(BODY, SECRET, undefined)).toBe(false);
    expect(verifyBtcpaySignature(BODY, SECRET, "")).toBe(false);
    expect(verifyBtcpaySignature(BODY, SECRET, hex)).toBe(false);
    expect(verifyBtcpaySignature(BODY, SECRET, `sha1=${hex}`)).toBe(false);
    expect(verifyBtcpaySignature(BODY, SECRET, `sha256=${hex.slice(0, 40)}`)).toBe(false);
    expect(verifyBtcpaySignature(BODY, SECRET, "sha256=not-hex")).toBe(false);
    expect(verifyBtcpaySignature(BODY, SECRET, [independent(BODY, SECRET)])).toBe(false);
  });

  it("refuses everything when the shop has no secret saved", () => {
    expect(verifyBtcpaySignature(BODY, "", independent(BODY, ""))).toBe(false);
  });
});

describe("normalizeBtcpayServerUrl", () => {
  const production = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  const development = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

  it("keeps an https origin and a path prefix, without the trailing slash", () => {
    expect(normalizeBtcpayServerUrl("https://pay.example.com/", production)).toBe("https://pay.example.com");
    expect(normalizeBtcpayServerUrl(" https://pay.example.com/btcpay// ", production)).toBe(
      "https://pay.example.com/btcpay",
    );
    expect(normalizeBtcpayServerUrl("https://pay.example.com:8443", production)).toBe("https://pay.example.com:8443");
  });

  it("refuses plain http for a public host", () => {
    expect(normalizeBtcpayServerUrl("http://pay.example.com", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("http://pay.example.com", development)).toBeNull();
  });

  it("accepts http on a loopback host outside production only, and refuses loopback in production", () => {
    expect(normalizeBtcpayServerUrl("http://localhost:23001/", development)).toBe("http://localhost:23001");
    expect(normalizeBtcpayServerUrl("http://127.0.0.1:23001", development)).toBe("http://127.0.0.1:23001");
    expect(normalizeBtcpayServerUrl("http://localhost:23001", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("https://localhost", production)).toBeNull();
  });

  it("refuses credentials, a query, a fragment, another scheme and garbage", () => {
    expect(normalizeBtcpayServerUrl("https://user:pass@pay.example.com", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("https://pay.example.com/?a=1", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("https://pay.example.com/#x", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("ftp://pay.example.com", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("pay.example.com", production)).toBeNull();
    expect(normalizeBtcpayServerUrl("", production)).toBeNull();
  });
});

describe("masking and completeness", () => {
  const row = {
    id: "tis_1",
    tenant_id: "ten_1",
    is_enabled: false,
    credentials: {
      server_url: "https://pay.example.com",
      store_id: "Store1",
      api_key: "greenfield-api-key-1234",
      webhook_secret: "whsec-5678",
    },
  };

  it("shows the server and store, and the two secrets only as set/last4", () => {
    const masked = maskBtcpaySettings(row);
    expect(masked).toEqual({
      id: "tis_1",
      provider: "btcpay",
      is_enabled: false,
      server_url: "https://pay.example.com",
      store_id: "Store1",
      api_key: { set: true, last4: "1234" },
      webhook_secret: { set: true, last4: "5678" },
    });
    expect(JSON.stringify(masked)).not.toContain("greenfield-api-key");
    expect(JSON.stringify(masked)).not.toContain("whsec-");
  });

  it("names the fields still empty", () => {
    expect(missingBtcpayFields(row.credentials)).toEqual([]);
    expect(missingBtcpayFields({ ...row.credentials, api_key: "", webhook_secret: "" })).toEqual([
      "api_key",
      "webhook_secret",
    ]);
  });
});
