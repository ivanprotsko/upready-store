import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { getJob } from "../../../../packshot/jobs";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/packshot-jobs/:job_id` (t-2026-09-25-n17) — the state of a job
 * `POST /tenants/products/:id/packshot` started. A job of another tenant answers
 * 404, the same as a job that does not exist (or was lost on a restart).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const job = getJob(tenant.id, req.params.job_id);

  if (!job) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Packshot job ${req.params.job_id} was not found`);
  }

  res.status(200).json({
    job_id: job.id,
    product_id: job.product_id,
    status: job.status,
    step: job.step,
    progress: job.progress,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
};
