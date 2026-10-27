/**
 * The model's daily spend cap ($5 by default), counted on the server from the
 * tokens the vendor reports. Past the cap this provider refuses before a call
 * leaves, `FallbackProvider` hands the turn to the keyword router, and the
 * page says why. A new UTC day starts from zero.
 */
import type { DailyBudget } from "../budget.ts";
import type { ModelProvider, ModelRequest, ModelStep } from "./types.ts";

export class ModelCapError extends Error {}

export interface Prices {
  /** Dollars per million input and output tokens. */
  inPerM: number;
  outPerM: number;
}

export class BudgetProvider implements ModelProvider {
  readonly name: string;
  readonly #inner: ModelProvider;
  readonly #budget: DailyBudget;
  readonly #capUsd: number;
  readonly #prices: Prices;

  constructor(inner: ModelProvider, budget: DailyBudget, capUsd: number, prices: Prices) {
    this.#inner = inner;
    this.#budget = budget;
    this.#capUsd = capUsd;
    this.#prices = prices;
    this.name = inner.name;
  }

  usage() {
    const { usd } = this.#budget.spent("model");
    return { usd, capUsd: this.#capUsd, capped: this.capped() };
  }

  capped(): boolean {
    return this.#budget.reached("model", { usd: this.#capUsd });
  }

  async next(request: ModelRequest): Promise<ModelStep> {
    if (this.capped()) throw new ModelCapError(`daily model cap $${this.#capUsd} reached`);
    const step = await this.#inner.next(request);
    if (step.usage) {
      const usd = (step.usage.inputTokens * this.#prices.inPerM + step.usage.outputTokens * this.#prices.outPerM) / 1_000_000;
      this.#budget.add("model", usd);
    }
    return step;
  }
}
