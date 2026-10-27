/**
 * Daily spend caps, counted on the server and kept on disk so a restart does
 * not reset them: the model ($5 a day by default) and images ($3 and 30
 * pictures a day). The day is the UTC day; a new day starts from zero.
 *
 * The page never counts: it reads the state from `/api/status`.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Bucket = "model" | "images";

interface Day {
  day: string;
  spent: Partial<Record<Bucket, { usd: number; count: number }>>;
}

export interface Cap {
  usd: number;
  /** A count cap too, e.g. 30 images; absent for the model. */
  count?: number;
}

export class DailyBudget {
  readonly #file: string;
  readonly #now: () => Date;
  #state: Day;

  constructor(dataDir: string, now: () => Date = () => new Date()) {
    this.#file = join(dataDir, "spend.json");
    this.#now = now;
    this.#state = this.#load();
  }

  #today(): string {
    return this.#now().toISOString().slice(0, 10);
  }

  #load(): Day {
    try {
      const raw = JSON.parse(readFileSync(this.#file, "utf8")) as Day;
      if (raw && typeof raw.day === "string" && raw.spent && typeof raw.spent === "object") return raw;
    } catch {
      // No file yet, or a broken one: start the day from zero.
    }
    return { day: this.#today(), spent: {} };
  }

  #roll(): void {
    if (this.#state.day !== this.#today()) this.#state = { day: this.#today(), spent: {} };
  }

  spent(bucket: Bucket): { usd: number; count: number } {
    this.#roll();
    return { ...(this.#state.spent[bucket] ?? { usd: 0, count: 0 }) };
  }

  /** True when one more item costing `usd` would go past the cap. */
  over(bucket: Bucket, cap: Cap, usd = 0): boolean {
    const now = this.spent(bucket);
    if (cap.count !== undefined && now.count + 1 > cap.count) return true;
    return now.usd + usd > cap.usd + 1e-9;
  }

  /** The cap is reached: nothing more today, whatever the next item costs. */
  reached(bucket: Bucket, cap: Cap): boolean {
    const now = this.spent(bucket);
    return now.usd >= cap.usd - 1e-9 || (cap.count !== undefined && now.count >= cap.count);
  }

  add(bucket: Bucket, usd: number, count = 1): void {
    this.#roll();
    const now = this.#state.spent[bucket] ?? { usd: 0, count: 0 };
    this.#state.spent[bucket] = { usd: Math.round((now.usd + usd) * 1e6) / 1e6, count: now.count + count };
    this.#save();
  }

  #save(): void {
    try {
      mkdirSync(dirname(this.#file), { recursive: true });
      const tmp = `${this.#file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.#state));
      renameSync(tmp, this.#file);
    } catch (err) {
      // The count still holds in memory for this process.
      console.error("[owner-voice] spend not saved:", err instanceof Error ? err.message : err);
    }
  }
}
