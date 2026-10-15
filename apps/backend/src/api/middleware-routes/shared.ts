import { MedusaError } from "@medusajs/framework/utils";
import { adminUploadRoutesMiddlewares } from "@medusajs/medusa/api/admin/uploads/middlewares";

/**
 * `POST /admin/uploads` parses its multipart body with multer, which is a
 * transitive dependency of `@medusajs/medusa` and is not resolvable from this
 * app. Reusing the Admin's own middleware array keeps `POST /tenants/uploads`
 * on exactly that parser without adding a dependency. If the array ever stops
 * carrying it, boot fails here rather than at the first upload, which would
 * otherwise arrive with `req.files` empty and answer a confusing 400.
 */
export const adminUploadPostMiddlewares =
  adminUploadRoutesMiddlewares.find(
    (route) => route.matcher === "/admin/uploads" && (route.method ?? []).includes("POST"),
  )?.middlewares ?? [];

if (adminUploadPostMiddlewares.length === 0) {
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "No middlewares found for POST /admin/uploads in @medusajs/medusa. " +
      "POST /tenants/uploads reuses them for its multipart parsing; see src/api/tenants/uploads/route.ts.",
  );
}
