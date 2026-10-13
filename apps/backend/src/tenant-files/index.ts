import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import fs from "fs/promises";
import path from "path";

/**
 * Tenant-scoped file storage, owner W2 (contract §5). Every file a tenant
 * uploads lands under `tenants/<tenant_id>/`, the key `uploadFilesWorkflow`
 * is given (`src/api/tenants/uploads/route.ts`). This module lists and
 * deletes that prefix directly against the active file provider (local disk
 * or S3), never through `@medusajs/file`'s module service: that service has
 * no database of its own (verified in
 * `@medusajs/file@2.19.0/dist/services/file-module-service.js` —
 * `createFiles` returns `{ id: file.key, url: file.url }`, `id` IS the
 * storage key; `listFiles`/`listAndCountFiles` only look up files by an ID
 * already known, they cannot enumerate a prefix), so there is nothing to
 * desync by bypassing it, and no other way to ask "everything under this
 * prefix" than talking to the provider's own storage.
 *
 * Provider detection mirrors `medusa-config.ts`'s `useS3`: S3 is active only
 * when `NODE_ENV=production` and `S3_BUCKET` is set; otherwise this targets
 * the local provider's `static/` directory under `process.cwd()`.
 */

export const TENANT_FILES_ROOT = "tenants";

/** Always ends with "/" — `tenants/<tenant_id>/`. */
export const tenantFilePrefix = (tenantId: string): string => `${TENANT_FILES_ROOT}/${tenantId}/`;

export type TenantFile = { key: string; url: string; size: number | null };

const isS3Active = (): boolean =>
  process.env.NODE_ENV === "production" && Boolean(process.env.S3_BUCKET);

// ---------------------------------------------------------------------------
// Local provider (@medusajs/file-local, dist/services/local-file.js)
// ---------------------------------------------------------------------------

/**
 * `LocalFileService`'s own defaults, used when the "local" provider entry in
 * `configModule.modules.file` carries no `options` (this app's case: neither
 * `medusa-config.ts` nor the framework's `defaultModules` — see
 * `@medusajs/utils/dist/common/define-config.js` — set `upload_dir` or
 * `backend_url` for it). Read from the container first so a future explicit
 * override is honoured without touching this file.
 */
const LOCAL_UPLOAD_DIR_DEFAULT = (): string => path.join(process.cwd(), "static");
const LOCAL_BACKEND_URL_DEFAULT = "http://localhost:9000/static";

type LocalProviderOptions = { upload_dir?: string; backend_url?: string };

const localProviderOptions = (container: MedusaContainer): LocalProviderOptions => {
  try {
    const configModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as {
      modules?: Record<string, unknown>;
    };
    const fileModule = configModule?.modules?.["file"];
    const providers =
      fileModule && typeof fileModule === "object" && "options" in fileModule
        ? ((fileModule as { options?: { providers?: Array<{ id?: string; options?: LocalProviderOptions }> } })
            .options?.providers ?? [])
        : [];
    const local = providers.find((provider) => provider.id === "local" || provider.id === "localfs");
    return local?.options ?? {};
  } catch {
    // configModule not resolvable (e.g. a unit context without a container) —
    // fall back to the provider's own defaults below.
    return {};
  }
};

const localUploadDir = (container: MedusaContainer): string =>
  localProviderOptions(container).upload_dir || LOCAL_UPLOAD_DIR_DEFAULT();

const localBackendUrl = (container: MedusaContainer): string =>
  localProviderOptions(container).backend_url || LOCAL_BACKEND_URL_DEFAULT;

const localPrefixDir = (container: MedusaContainer, tenantId: string): string =>
  path.join(localUploadDir(container), TENANT_FILES_ROOT, tenantId);

const walkLocal = async (dir: string, root: string, baseUrl: string): Promise<TenantFile[]> => {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const files: TenantFile[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkLocal(full, root, baseUrl)));
    } else if (entry.isFile()) {
      const key = path.relative(root, full).split(path.sep).join("/");
      const stat = await fs.stat(full);
      files.push({ key, url: `${baseUrl}/${key}`, size: stat.size });
    }
  }
  return files;
};

const listLocalTenantFiles = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<TenantFile[]> =>
  walkLocal(localPrefixDir(container, tenantId), localUploadDir(container), localBackendUrl(container));

const listLocalPrefix = async (container: MedusaContainer, prefix: string): Promise<TenantFile[]> =>
  walkLocal(path.join(localUploadDir(container), prefix), localUploadDir(container), localBackendUrl(container));

const deleteLocalTenantFiles = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<{ deleted: number }> => {
  const files = await listLocalTenantFiles(container, tenantId);
  // Nothing there → still attempt to remove an (empty) directory tree left
  // behind by an earlier delete; harmless either way, never an error.
  await fs.rm(localPrefixDir(container, tenantId), { recursive: true, force: true });
  return { deleted: files.length };
};

// ---------------------------------------------------------------------------
// S3 provider (@medusajs/file-s3, dist/services/s3-file.js)
// ---------------------------------------------------------------------------

const s3Config = () => ({
  bucket: process.env.S3_BUCKET as string,
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
});

// Built once per process, same as S3FileService's own this.client_.
let s3ClientSingleton: import("@aws-sdk/client-s3").S3Client | undefined;

const getS3Client = async (): Promise<import("@aws-sdk/client-s3").S3Client> => {
  if (!s3ClientSingleton) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const config = s3Config();
    s3ClientSingleton = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId!, secretAccessKey: config.secretAccessKey! },
      // Same env vars and flag as medusa-config.ts's s3Module.
      forcePathStyle: true,
    });
  }
  return s3ClientSingleton;
};

/** Mirrors S3FileService.upload()'s `url = ${fileUrl}/${encodedKey}`. */
const s3FileUrl = (key: string): string => {
  const { bucket, endpoint } = s3Config();
  const fileUrl = `${endpoint}/${bucket}`;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${fileUrl}/${encodedKey}`;
};

const listS3TenantFiles = async (tenantId: string): Promise<TenantFile[]> => listS3Prefix(tenantFilePrefix(tenantId));

const listS3Prefix = async (prefix: string): Promise<TenantFile[]> => {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const { bucket } = s3Config();

  const files: TenantFile[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const object of response.Contents ?? []) {
      if (!object.Key) {
        continue;
      }
      files.push({ key: object.Key, url: s3FileUrl(object.Key), size: object.Size ?? null });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return files;
};

const deleteS3TenantFiles = async (tenantId: string): Promise<{ deleted: number }> => {
  const files = await listS3TenantFiles(tenantId);
  if (files.length === 0) {
    return { deleted: 0 };
  }

  const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const { bucket } = s3Config();
  const chunkSize = 1000;

  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((file) => ({ Key: file.key })), Quiet: true },
      }),
    );
  }

  return { deleted: files.length };
};

// ---------------------------------------------------------------------------
// Public API (contract §5)
// ---------------------------------------------------------------------------

/**
 * Every object under the tenant's prefix (local provider:
 * `static/tenants/<id>/**`; S3: `ListObjectsV2` by prefix).
 */
export const listTenantFiles = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<TenantFile[]> =>
  isS3Active() ? listS3TenantFiles(tenantId) : listLocalTenantFiles(container, tenantId);

/**
 * Deletes exactly the objects under the prefix. Returns how many. Nothing
 * under the prefix = 0, not an error.
 */
export const deleteTenantFiles = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<{ deleted: number }> =>
  isS3Active() ? deleteS3TenantFiles(tenantId) : deleteLocalTenantFiles(container, tenantId);

/**
 * Every object under any `prefix` of the active provider, with its size: the
 * course importer's check of what it already uploaded
 * (`scripts/course-import-export.ts`, prefix `courses/<tenant_id>/<slug>/`).
 * `prefix` ends with "/"; nothing there is an empty list.
 */
export const listFilesUnderPrefix = async (container: MedusaContainer, prefix: string): Promise<TenantFile[]> =>
  isS3Active() ? listS3Prefix(prefix) : listLocalPrefix(container, prefix);
