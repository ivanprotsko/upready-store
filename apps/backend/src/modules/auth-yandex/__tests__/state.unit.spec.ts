import { createNonce, decodeState, encodeState } from "../lib/state";

const SECRET = "state-secret-for-tests";

const basePayload = {
  cb: "https://cherkashino.ru/api/yandex-callback",
  tn: "cherkashino",
  lc: "ru",
  rt: "/ru/account",
  n: "0123456789abcdef0123456789abcdef",
};

describe("auth-yandex state", () => {
  it("round-trips the payload the Redirect URI cannot carry", () => {
    const state = encodeState(basePayload, SECRET);
    const verdict = decodeState(state, SECRET);

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) {
      return;
    }
    expect(verdict.payload.cb).toBe(basePayload.cb);
    expect(verdict.payload.tn).toBe("cherkashino");
    expect(verdict.payload.lc).toBe("ru");
    expect(verdict.payload.rt).toBe("/ru/account");
    expect(verdict.payload.n).toBe(basePayload.n);
  });

  it("expires ten minutes out, matching the lifetime of a Yandex code", () => {
    const now = 1_780_000_000_000;
    const state = encodeState(basePayload, SECRET, { nowMs: now });

    expect(decodeState(state, SECRET, { nowMs: now + 599_000 }).ok).toBe(true);

    const late = decodeState(state, SECRET, { nowMs: now + 601_000 });
    expect(late.ok).toBe(false);
    expect(late.ok === false && late.reason).toBe("expired");
  });

  it("rejects a tampered payload as a bad signature, never as expired", () => {
    const state = encodeState(basePayload, SECRET);
    const [body, signature] = state.split(".");

    const forged = Buffer.from(
      JSON.stringify({
        ...basePayload,
        cb: "https://evil.example.com/api/yandex-callback",
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      "utf8",
    ).toString("base64url");

    const verdict = decodeState(`${forged}.${signature}`, SECRET);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe("bad_signature");

    // And the body alone, re-signed under another secret, does not pass either.
    const otherSecret = decodeState(
      encodeState(basePayload, "a-different-secret"),
      SECRET,
    );
    expect(otherSecret.ok).toBe(false);
    expect(otherSecret.ok === false && otherSecret.reason).toBe("bad_signature");

    expect(body).toBeTruthy();
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "nodot", ".", "a.", ".b"]) {
      const verdict = decodeState(bad, SECRET);
      expect(verdict.ok).toBe(false);
    }

    // A well-signed body that is not our payload shape is malformed, not valid.
    const junk = Buffer.from(JSON.stringify({ hello: "world" }), "utf8").toString(
      "base64url",
    );
    const signedJunk = encodeState(basePayload, SECRET).split(".")[1];
    expect(decodeState(`${junk}.${signedJunk}`, SECRET).ok).toBe(false);
  });

  it("truncating the signature is rejected rather than crashing timingSafeEqual", () => {
    const state = encodeState(basePayload, SECRET);
    const [body, signature] = state.split(".");

    expect(() => decodeState(`${body}.${signature.slice(0, 8)}`, SECRET)).not.toThrow();
    expect(decodeState(`${body}.${signature.slice(0, 8)}`, SECRET).ok).toBe(false);
  });

  it("gives every attempt its own nonce", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
  });

  it("refuses to sign or verify without a secret", () => {
    expect(() => encodeState(basePayload, "")).toThrow(/secret/i);
    expect(() => decodeState("a.b", "")).toThrow(/secret/i);
  });
});
