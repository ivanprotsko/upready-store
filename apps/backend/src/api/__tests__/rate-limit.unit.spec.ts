import { clientKey, rateLimit, slidingWindow } from "../rate-limit";

/** Audit 2026-09-23, A-04: login and registration are rate limited. */
describe("sliding window", () => {
  it("allows ten requests a minute per key and refuses the eleventh with a wait", () => {
    let now = 1_000_000;
    const window = slidingWindow({ now: () => now });

    for (let i = 0; i < 10; i += 1) {
      expect(window.hit("1.2.3.4").allowed).toBe(true);
      now += 1_000;
    }
    const refused = window.hit("1.2.3.4");
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 50 });

    // Another client is not affected.
    expect(window.hit("5.6.7.8").allowed).toBe(true);
  });

  it("slides: the oldest request leaving the window frees one slot", () => {
    let now = 0;
    const window = slidingWindow({ limit: 2, windowMs: 60_000, now: () => now });
    window.hit("a");
    now = 30_000;
    window.hit("a");
    expect(window.hit("a").allowed).toBe(false);
    now = 60_001;
    expect(window.hit("a").allowed).toBe(true);
    expect(window.hit("a").allowed).toBe(false);
  });
});

describe("client key", () => {
  const req = (xff?: string) => ({
    headers: xff ? { "x-forwarded-for": xff } : {},
    socket: { remoteAddress: "10.0.0.2" },
  });

  it("uses the first X-Forwarded-For hop only when TRUST_PROXY=1", () => {
    expect(clientKey(req("203.0.113.7, 10.0.0.2"), { TRUST_PROXY: "1" })).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For without TRUST_PROXY", () => {
    expect(clientKey(req("203.0.113.7"), {})).toBe("10.0.0.2");
  });

  it("falls back to the socket when the proxy sent no header", () => {
    expect(clientKey(req(), { TRUST_PROXY: "1" })).toBe("10.0.0.2");
  });
});

describe("middleware", () => {
  it("answers 429 with Retry-After once the window is full", () => {
    const middleware = rateLimit({ limit: 1, now: () => 0, env: {} });
    const request = { headers: {}, socket: { remoteAddress: "9.9.9.9" } } as never;
    const response = {
      headers: {} as Record<string, string>,
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    const next = jest.fn();

    middleware(request, response as never, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(request, response as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("60");
  });

  it("stays out of the way of the HTTP integration suites (NODE_ENV=test)", () => {
    const middleware = rateLimit({ limit: 1, now: () => 0, env: { NODE_ENV: "test" } });
    const request = { headers: {}, socket: { remoteAddress: "9.9.9.9" } } as never;
    const next = jest.fn();
    middleware(request, {} as never, next);
    middleware(request, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
