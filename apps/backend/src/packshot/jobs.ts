import { generateEntityId } from "@medusajs/framework/utils";
import type { PackshotMeta, PackshotStep } from "./pipeline";

/**
 * In-memory registry of packshot jobs, keyed by `pkjob_<ulid>` and scoped to the
 * tenant that started them. Jobs are lost on a backend restart: a job is a few
 * seconds to a minute of work, and its result is a normal uploaded file the panel
 * has already been handed. A table is phase 2 if Ivan wants a history.
 *
 * The map lives on `globalThis`, the way Packshot Studio keeps its own, so a module
 * reloaded by `medusa develop` keeps the running jobs.
 */

export type JobStatus = "queued" | "running" | "done" | "error";

export type PackshotJob = {
  id: string;
  tenant_id: string;
  product_id: string;
  status: JobStatus;
  step: PackshotStep | "upload" | null;
  progress: number;
  result: { url: string; width: number; height: number; meta: PackshotMeta } | null;
  error: { code: string; message: string } | null;
  created_at: number;
  finished_at: number | null;
};

const MAX_JOBS = 200;
/** A finished job is kept this long for the panel to read, then evicted. */
const FINISHED_TTL_MS = 60 * 60 * 1000;

const store = globalThis as unknown as { __upreadyPackshotJobs?: Map<string, PackshotJob> };
const jobs: Map<string, PackshotJob> = (store.__upreadyPackshotJobs ??= new Map());

const evict = (now: number) => {
  for (const [id, job] of jobs) {
    if (job.finished_at !== null && now - job.finished_at > FINISHED_TTL_MS) jobs.delete(id);
  }

  if (jobs.size < MAX_JOBS) return;

  for (const [id, job] of jobs) {
    if (job.finished_at !== null) {
      jobs.delete(id);
      if (jobs.size < MAX_JOBS) return;
    }
  }
};

export function createJob(tenantId: string, productId: string, now = Date.now()): PackshotJob {
  evict(now);

  const job: PackshotJob = {
    id: generateEntityId(undefined, "pkjob"),
    tenant_id: tenantId,
    product_id: productId,
    status: "queued",
    step: null,
    progress: 0,
    result: null,
    error: null,
    created_at: now,
    finished_at: null,
  };

  jobs.set(job.id, job);
  return job;
}

/** The job, or `undefined` when it does not exist or belongs to another tenant. */
export function getJob(tenantId: string, jobId: string): PackshotJob | undefined {
  const job = jobs.get(jobId);

  return job && job.tenant_id === tenantId ? job : undefined;
}

export function updateJob(jobId: string, patch: Partial<Omit<PackshotJob, "id" | "tenant_id" | "product_id">>): void {
  const job = jobs.get(jobId);

  if (job) Object.assign(job, patch);
}

/** Runs `work` for the job and records its outcome; never throws. */
export async function runJob(
  jobId: string,
  work: (report: (step: PackshotJob["step"], progress: number) => void) => Promise<NonNullable<PackshotJob["result"]>>,
): Promise<void> {
  updateJob(jobId, { status: "running" });

  try {
    const result = await work((step, progress) => updateJob(jobId, { step, progress }));

    updateJob(jobId, { status: "done", step: null, progress: 100, result, finished_at: Date.now() });
  } catch (err) {
    const code = (err as { code?: unknown })?.code;

    updateJob(jobId, {
      status: "error",
      error: {
        code: typeof code === "string" ? code : "engine_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      finished_at: Date.now(),
    });
  }
}

/** For the unit specs only. */
export const clearJobs = () => jobs.clear();
