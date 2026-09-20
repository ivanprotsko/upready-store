import { CdekError, forgetCdekToken, listTariffs, type CdekCredentials } from "../client";

/**
 * The retry behaviour of the CDEK client (i02-apiship-cdek-shipping).
 *
 * Why this suite exists: measured against the sandbox on 2026-09-16, eight
 * identical `/calculator/tarifflist` calls answered 200 six times and
 * `500 v2_internal_error` twice. Without the retry a CDEK option disappears from
 * the checkout roughly every fourth page load, and nothing in the repository
 * would notice — the checkout simply renders one card fewer.
 */

const CREDENTIALS: CdekCredentials = {
  base: "https://api.test.invalid/v2",
  account: "acc",
  password: "pwd",
};

const TARIFFS = {
  tariff_codes: [
    {
      tariff_code: 136,
      tariff_name: "Посылка склад-склад",
      delivery_mode: 4,
      delivery_sum: 185,
      period_min: 1,
      period_max: 2,
    },
  ],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const token = () => json(200, { access_token: "tok", expires_in: 3599 })

/** A `fetch` that plays a scripted list of answers and records what it was asked. */
const scriptedFetch = (script: Array<() => Response>) => {
  const calls: string[] = []
  let index = 0
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.includes("/oauth/token")) return token()
    const next = script[Math.min(index, script.length - 1)]
    index += 1
    return next()
  }) as unknown as typeof fetch
  return { impl, calls, tariffCalls: () => calls.filter((u) => u.includes("/calculator/")).length }
}

const input = {
  from_location: { code: 44 },
  to_location: { code: 137 },
  packages: [{ weight: 1000 }],
}

describe("cdek/client retry", () => {
  beforeEach(() => {
    forgetCdekToken(CREDENTIALS)
  })

  /**
   * The same two retries production does, with the pauses set to zero. The
   * COUNT is what this suite is about; the length of the pause is a tuning
   * constant, and waiting 1.6 s per case to re-measure it would buy nothing.
   */
  const NO_WAIT = { retryDelaysMs: [0, 0] }

  it("answers from the first call when CDEK is healthy", async () => {
    const fetchImpl = scriptedFetch([() => json(200, TARIFFS)])
    const tariffs = await listTariffs(CREDENTIALS, input, {
      fetchImpl: fetchImpl.impl,
      ...NO_WAIT,
    })
    expect(tariffs).toHaveLength(1)
    expect(fetchImpl.tariffCalls()).toBe(1)
  })

  it("retries a transient 500 and returns the answer that follows", async () => {
    const fetchImpl = scriptedFetch([
      () => json(500, { errors: [{ code: "v2_internal_error", message: "Internal Error" }] }),
      () => json(200, TARIFFS),
    ])
    const tariffs = await listTariffs(CREDENTIALS, input, {
      fetchImpl: fetchImpl.impl,
      ...NO_WAIT,
    })
    expect(tariffs).toHaveLength(1)
    expect(fetchImpl.tariffCalls()).toBe(2)
  })

  it("gives up after the scripted attempts and carries CDEK's own error code", async () => {
    const fetchImpl = scriptedFetch([
      () => json(500, { errors: [{ code: "v2_internal_error", message: "Internal Error" }] }),
    ])
    await expect(
      listTariffs(CREDENTIALS, input, { fetchImpl: fetchImpl.impl, ...NO_WAIT }),
    ).rejects.toThrow(CdekError)
    // one first call plus the two backoff attempts
    expect(fetchImpl.tariffCalls()).toBe(3)
  })

  it("never retries a 4xx — repeating a rejected request changes nothing", async () => {
    const fetchImpl = scriptedFetch([
      () => json(400, { errors: [{ code: "v2_bad_request", message: "no" }] }),
    ])
    await expect(
      listTariffs(CREDENTIALS, input, { fetchImpl: fetchImpl.impl, ...NO_WAIT }),
    ).rejects.toThrow(CdekError)
    expect(fetchImpl.tariffCalls()).toBe(1)
  })

  it("re-authenticates once on a 401 and then succeeds", async () => {
    const fetchImpl = scriptedFetch([() => json(401, {}), () => json(200, TARIFFS)])
    const tariffs = await listTariffs(CREDENTIALS, input, {
      fetchImpl: fetchImpl.impl,
      ...NO_WAIT,
    })
    expect(tariffs).toHaveLength(1)
    // two token calls: the first one, then the forced refresh after the 401
    expect(fetchImpl.calls.filter((u) => u.includes("/oauth/token"))).toHaveLength(2)
  })
})
