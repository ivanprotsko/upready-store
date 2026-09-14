import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { MedusaError } from "@medusajs/framework/utils";
import { getTenantScope } from "../tenant-scope";
import { tenantFilePrefix } from "../../../tenant-files";

/**
 * `POST /tenants/uploads` — the tenant's own upload handler. Multer's memory
 * storage still comes from the Admin's own middleware array, reused in
 * `src/api/middlewares.ts` (`multer` is a transitive dependency of
 * `@medusajs/medusa`, not resolvable from this app, so `req.files` is typed
 * locally below rather than importing `@types/multer`).
 *
 * Every file lands under the caller's own prefix, `tenants/<tenant_id>/`
 * (contract §5): the workflow input is copied from
 * `@medusajs/medusa/dist/api/admin/uploads/route.js`, with `filename`
 * prefixed by `tenantFilePrefix(tenant.id)`. `content` is base64 — the actual
 * source encodes it that way (not `"binary"`; `decodeFileContent` in both
 * `local-file.js` and `s3-file.js` first tries a base64 round-trip before
 * falling back to binary/UTF-8, so base64 is what actually reaches the
 * provider unmodified).
 *
 * Response stays `{ files: [{ id, url }] }`, what the panel's copied media
 * form posts to and reads; `id` here is the provider storage key itself,
 * `tenants/<tenant_id>/<name>-<ulid>.<ext>` (see `src/tenant-files/index.ts`
 * for why — `@medusajs/file`'s module service has no database of its own).
 */

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const files = (req as unknown as { files?: UploadedFile[] }).files;

  if (!files?.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No files were uploaded");
  }

  const tenant = await getTenantScope(req);
  const prefix = tenantFilePrefix(tenant.id);

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((file) => ({
        filename: prefix + file.originalname,
        mimeType: file.mimetype,
        content: file.buffer.toString("base64"),
        access: "public" as const,
      })),
    },
  });

  res.status(200).json({ files: result });
};
