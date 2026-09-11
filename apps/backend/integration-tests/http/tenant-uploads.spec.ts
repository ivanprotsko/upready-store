import path from "node:path";
import fs from "node:fs/promises";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { listTenantFiles, deleteTenantFiles, tenantFilePrefix } from "../../src/tenant-files";
import deleteTenantWorkflow from "../../src/workflows/tenant/delete-tenant";

jest.setTimeout(180_000);

/**
 * Seam test of `src/tenant-files/index.ts` (contract §5) against the local
 * file provider: two tenants, each uploading through `POST /tenants/uploads`,
 * prove the key prefix isolates them and that deleting one tenant's files
 * never touches the other's — both through the helper directly and through
 * `deleteTenantWorkflow`'s `purge_files: true` step (owner W1, imports the
 * same helper via `deleteTenantFilesStep`).
 *
 * Style follows `tenants.spec.ts`: the runner's own throwaway database is
 * restored to its post-`beforeAll` snapshot before every test, so the tenant
 * rows created in `beforeAll` are stable across tests, but files on disk are
 * NOT part of that snapshot — they are real filesystem writes under `cwd`
 * (`apps/backend`, since that's where the test process runs), which is why
 * `afterAll` cleans them up explicitly.
 */

const PASSWORD = "supersecret";

// A minimal valid 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/**
 * Builds a multipart/form-data body by hand. The repository has no
 * `form-data` package resolvable from `apps/backend` (only transitively, via
 * axios), so this avoids adding a dependency for one test file.
 */
const buildMultipart = (
  fieldName: string,
  filename: string,
  mimeType: string,
  content: Buffer,
): { body: Buffer; contentType: string } => {
  const boundary = `----tenantUploadsSpec${Date.now()}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
};

type Registered = { token: string; tenant: { id: string; handle: string } };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenant uploads: files under tenants/<id>/", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        expect(registration.status).toBe(200);

        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);

        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);

        return { token: login.data.token, tenant: created.data.tenant };
      };

      const uploadPng = async (owner: Registered, filename: string) => {
        const { body, contentType } = buildMultipart("files", filename, "image/png", PNG_BUFFER);
        return api.post("/tenants/uploads", body, {
          headers: { ...bearer(owner.token).headers, "content-type": contentType },
        });
      };

      let acme: Registered;
      let globex: Registered;

      beforeAll(async () => {
        acme = await registerTenant("acme-files", "Acme");
        globex = await registerTenant("globex-files", "Globex");
      });

      afterAll(async () => {
        const container = getContainer();
        // Best-effort: whatever either tenant still has on disk after the
        // suite, regardless of which test left it there.
        await deleteTenantFiles(container, acme.tenant.id);
        await deleteTenantFiles(container, globex.tenant.id);
      });

      it("scopes uploads under the tenant's prefix and deletes exactly that prefix", async () => {
        const container = getContainer();

        const uploaded = await uploadPng(acme, "logo.png");
        expect(uploaded.status).toBe(200);
        expect(uploaded.data.files).toHaveLength(1);
        expect(uploaded.data.files[0].url).toContain(`/static/${tenantFilePrefix(acme.tenant.id)}`);

        // Isolation, checked before Globex has uploaded anything at all: a
        // real zero, not "nobody asked".
        const acmeFiles = await listTenantFiles(container, acme.tenant.id);
        const globexFilesBefore = await listTenantFiles(container, globex.tenant.id);
        expect(acmeFiles).toHaveLength(1);
        expect(globexFilesBefore).toHaveLength(0);

        const globexUpload = await uploadPng(globex, "logo.png");
        expect(globexUpload.status).toBe(200);
        const globexFilePath = path.join(process.cwd(), "static", (await listTenantFiles(container, globex.tenant.id))[0].key);

        const acmeFilePath = path.join(process.cwd(), "static", acmeFiles[0].key);
        const result = await deleteTenantFiles(container, acme.tenant.id);
        expect(result).toEqual({ deleted: 1 });

        await expect(fs.access(acmeFilePath)).rejects.toThrow();
        expect(await listTenantFiles(container, acme.tenant.id)).toHaveLength(0);

        // Globex's file, uploaded after the isolation check above, survives
        // Acme's deletion untouched.
        await expect(fs.access(globexFilePath)).resolves.toBeUndefined();
        expect(await listTenantFiles(container, globex.tenant.id)).toHaveLength(1);
      });

      it("deleteTenantWorkflow with purge_files: true deletes the tenant's files too", async () => {
        const container = getContainer();

        // Globex still carries the file from the previous test.
        const before = await listTenantFiles(container, globex.tenant.id);
        expect(before.length).toBeGreaterThanOrEqual(1);

        await deleteTenantWorkflow(container).run({
          input: { id: globex.tenant.id, purge_files: true },
        });

        expect(await listTenantFiles(container, globex.tenant.id)).toHaveLength(0);
      });
    });
  },
});
