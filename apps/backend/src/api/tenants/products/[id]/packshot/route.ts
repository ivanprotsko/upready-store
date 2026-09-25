import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, generateEntityId } from "@medusajs/framework/utils";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { falKey } from "../../../../../packshot/config";
import { createJob, runJob } from "../../../../../packshot/jobs";
import {
  MISSING_KEY_MESSAGE,
  PackshotError,
  planPackshot,
  prepareSource,
  runPackshot,
} from "../../../../../packshot/pipeline";
import { SourceError, readSourceImage } from "../../../../../packshot/source";
import { tenantFilePrefix } from "../../../../../tenant-files";
import { assertUploadIsAPicture } from "../../../../../tenant-files/upload-policy";
import { assertOwnedProduct, getTenantScope } from "../../../tenant-scope";
import { PostPackshotSchema } from "./validators";

/**
 * `POST /tenants/products/:id/packshot` (t-2026-09-25-n17) starts a packshot job
 * for one of the tenant's own products and answers `202 { job_id }`; the panel
 * polls `GET /tenants/packshot-jobs/:job_id`.
 *
 * The source is one of the product's own images (`source_url` must equal its
 * thumbnail or an `images[].url`, anything else is refused before any fetch) or a
 * fresh picture uploaded as multipart `files` (the multer array of
 * `POST /tenants/uploads`, wired in `src/api/middlewares.ts`). A foreign product
 * answers 404 like every `/tenants/products/:id` route.
 *
 * Before the 202 the route decodes the source and takes every decision of the
 * pipeline (`planPackshot`). When those need fal.ai (engine bria, or the
 * re-render) and `FAL_KEY` is not set, it answers 409 with a plain message
 * instead of starting a job that could only fail.
 *
 * The result PNG goes through `uploadFilesWorkflow` under
 * `tenants/<tenant_id>/packshots/<product_handle>-<ulid>.png` (the local provider
 * prefixes the file name with a timestamp), so its URL is an ordinary product
 * image URL. This route never writes the product: accepting the picture is the
 * panel's own product update.
 */

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id;

  await assertOwnedProduct(req, productId);

  const parsed = PostPackshotSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    throw invalid(parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
  }

  const options = parsed.data.options as { engine: "auto" | "local" | "bria"; shadow: boolean; mode: "exact" | "rerender" };
  const files = (req as unknown as { files?: UploadedFile[] }).files ?? [];
  const tenant = await getTenantScope(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.url"],
    filters: { id: productId },
  });

  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id "${productId}" was not found`);
  }

  let source: Buffer;

  if (files.length > 0) {
    if (files.length > 1) throw invalid("Send one picture at a time.");
    assertUploadIsAPicture(files[0]!);
    source = files[0]!.buffer;
  } else {
    const url = parsed.data.source_url;

    if (!url) throw invalid("Pass source_url (one of the product's images) or upload a picture.");

    const own = new Set(
      [product.thumbnail, ...((product.images ?? []) as { url?: string | null }[]).map((image) => image?.url)].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    );

    if (!own.has(url)) throw invalid("source_url must be one of this product's own images or its thumbnail.");

    try {
      source = await readSourceImage(url);
    } catch (err) {
      throw invalid(err instanceof SourceError ? err.message : "The image could not be read.");
    }
  }

  let plan: Awaited<ReturnType<typeof planPackshot>>;

  try {
    plan = await planPackshot(await prepareSource(source), options);
  } catch (err) {
    throw invalid(err instanceof PackshotError ? err.message : "The picture could not be read.");
  }

  if (plan.needs_fal && !falKey()) {
    res.status(409).json({ message: MISSING_KEY_MESSAGE });
    return;
  }

  const job = createJob(tenant.id, productId);
  const scope = req.scope;
  const handle = (product.handle as string | null) || productId;

  void runJob(job.id, async (report) => {
    const { png, meta } = await runPackshot({ source, options, falKey: falKey(), onStep: report });

    report("upload", 97);

    const name = `${handle}-${generateEntityId(undefined, "x").slice(2)}.png`.toLowerCase();
    const { result } = await uploadFilesWorkflow(scope).run({
      input: {
        files: [
          {
            filename: `${tenantFilePrefix(tenant.id)}packshots/${name}`,
            mimeType: "image/png",
            content: png.toString("base64"),
            access: "public" as const,
          },
        ],
      },
    });

    return { url: result[0]!.url, width: meta.canvas[0], height: meta.canvas[1], meta };
  });

  res.status(202).json({ job_id: job.id });
};
