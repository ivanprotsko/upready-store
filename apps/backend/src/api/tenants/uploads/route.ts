/**
 * `POST /tenants/uploads` — the Admin's own `POST /admin/uploads` handler,
 * re-exported rather than copied. It reads `req.files` (multer memory storage,
 * field `files`) and runs `uploadFilesWorkflow`, answering `{ files: [{ id,
 * url }] }`, which is what the panel's copied media form posts to and reads.
 *
 * The multer middleware comes from the Admin's own middleware array, reused in
 * `src/api/middlewares.ts`: `multer` is a transitive dependency of
 * `@medusajs/medusa` and is not resolvable from this app, so importing it here
 * would mean adding a dependency.
 *
 * Uploaded files land in the configured file provider under a generated name.
 * They are not tenant-scoped, the same way they are not scoped for the Admin;
 * a tenant only ever learns the URL of a file it uploaded itself.
 */
export { POST } from "@medusajs/medusa/api/admin/uploads/route";
