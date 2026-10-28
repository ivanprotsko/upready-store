/**
 * A model failure is not a dead end. When the model throws (an HTTP error, no
 * network, a timeout, an empty balance), the keyword router answers the same
 * turn. The cause goes to the server log and to `/api/status`, cut short and
 * with anything key-shaped masked.
 */
import type { ModelProvider, ModelRequest, ModelStep } from "./types.ts";

export interface FallbackNote {
  /** When the model last failed, ISO time. */
  at: string;
  /** Why, e.g. `Anthropic answered 400: … credit balance is too low …`. */
  reason: string;
}

/** Masks API-key-shaped strings so a vendor's error text can be shown safely. */
export function safeReason(message: string, secrets: (string | null)[] = []): string {
  let out = message;
  for (const secret of secrets) if (secret) out = out.split(secret).join("***");
  return out
    .replace(/\b(sk|xi|key)[-_][A-Za-z0-9_-]{8,}/gi, "***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export class FallbackProvider implements ModelProvider {
  readonly name: string;
  readonly #primary: ModelProvider;
  readonly #backup: ModelProvider;
  readonly #secrets: (string | null)[];
  /** The last failure, cleared by the next answer the model gives itself. */
  last: FallbackNote | null = null;

  constructor(primary: ModelProvider, backup: ModelProvider, secrets: (string | null)[] = []) {
    this.#primary = primary;
    this.#backup = backup;
    this.#secrets = secrets;
    this.name = primary.name;
  }

  async next(request: ModelRequest): Promise<ModelStep> {
    try {
      const step = await this.#primary.next(request);
      this.last = null;
      return step;
    } catch (err) {
      const reason = safeReason(err instanceof Error ? err.message : String(err), this.#secrets);
      this.last = { at: new Date().toISOString(), reason };
      console.error(`[owner-voice] model ${this.#primary.name} failed, the keyword router answers this turn: ${reason}`);
      return this.#backup.next(request);
    }
  }
}
