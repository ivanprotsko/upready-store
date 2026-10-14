import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import ApishipFulfillmentService, { QUOTE_CACHE_MAX } from "../service";
import type { ApishipCalculatorAnswer } from "../../../apiship/client";

/**
 * The quote cache of the ApiShip provider is bounded (t-2026-10-14-58, the
 * lead's review): an entry older than a minute leaves on the next insert, and
 * the cache never holds more than `QUOTE_CACHE_MAX` answers. Before this a
 * production process kept every (shop, route, weight) it ever priced.
 */
class TestService extends ApishipFulfillmentService {
  remember(key: string, answer: ApishipCalculatorAnswer, now: number) {
    this.rememberQuote(key, answer, now);
  }

  read(key: string, now: number) {
    return this.cachedQuote(key, now);
  }

  get size() {
    return this.quoteCache_.size;
  }

  get keys() {
    return [...this.quoteCache_.keys()];
  }
}

const buildService = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return new TestService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never);
};

const answerFor = (tag: string): ApishipCalculatorAnswer =>
  ({ deliveryToDoor: [], deliveryToPoint: [], tag }) as unknown as ApishipCalculatorAnswer;

const T0 = 1_000_000;
const MINUTE = 60_000;

describe("ApishipFulfillmentService quote cache", () => {
  it("serves an answer younger than a minute and refuses a stale one", () => {
    const service = buildService();
    service.remember("k", answerFor("a"), T0);
    expect(service.read("k", T0 + MINUTE - 1)).toEqual(answerFor("a"));
    expect(service.read("k", T0 + MINUTE)).toBeNull();
    expect(service.read("missing", T0)).toBeNull();
  });

  it("drops the entries that have expired on the next insert", () => {
    const service = buildService();
    service.remember("old", answerFor("old"), T0);
    service.remember("fresh", answerFor("fresh"), T0 + MINUTE - 1);
    expect(service.keys).toEqual(["old", "fresh"]);

    service.remember("later", answerFor("later"), T0 + MINUTE);
    expect(service.keys).toEqual(["fresh", "later"]);
  });

  it("keeps at most the limit, the oldest leaving first", () => {
    const service = buildService();
    for (let i = 0; i <= QUOTE_CACHE_MAX; i++) {
      service.remember(`k${i}`, answerFor(`k${i}`), T0 + i);
    }
    expect(service.size).toBe(QUOTE_CACHE_MAX);
    expect(service.read("k0", T0 + QUOTE_CACHE_MAX)).toBeNull();
    expect(service.read("k1", T0 + QUOTE_CACHE_MAX)).toEqual(answerFor("k1"));
    expect(service.read(`k${QUOTE_CACHE_MAX}`, T0 + QUOTE_CACHE_MAX)).toEqual(answerFor(`k${QUOTE_CACHE_MAX}`));
  });

  it("moves a key written again to the back of the line", () => {
    const service = buildService();
    for (let i = 0; i < QUOTE_CACHE_MAX; i++) {
      service.remember(`k${i}`, answerFor(`k${i}`), T0);
    }
    service.remember("k0", answerFor("k0 again"), T0 + 1);
    service.remember("new", answerFor("new"), T0 + 2);

    expect(service.size).toBe(QUOTE_CACHE_MAX);
    expect(service.read("k1", T0 + 2)).toBeNull();
    expect(service.read("k0", T0 + 2)).toEqual(answerFor("k0 again"));
    expect(service.read("new", T0 + 2)).toEqual(answerFor("new"));
  });
});
