#!/usr/bin/env node
/**
 * One-off check of the S3 branch of `src/tenant-files/index.ts` against a
 * real R2 bucket, run manually once by W2 tonight (not part of the jest
 * suite — needs live credentials, and it isn't the app's configured S3
 * bucket). Mirrors, rather than imports, that module's list/delete-by-prefix
 * algorithm: this is a plain `.mjs` script, and importing a `.ts` module here
 * would need a loader this repo doesn't wire up for one-off scripts — the
 * algorithm below (ListObjectsV2 paginated by prefix, DeleteObjects in
 * chunks of 1000) is copied from `listS3TenantFiles`/`deleteS3TenantFiles`.
 *
 * Reads credentials from the environment — never embed them here. Run:
 *
 *   set -a; source ~/upready/.env.keys; set +a
 *   node scripts/tenant-files-r2-check.mjs
 *
 * Needs R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY
 * (the "42a three backup tiers + R2/restic" bucket) and CLOUDFLARE_ACCOUNT_ID
 * (the endpoint is `https://<id>.r2.cloudflarestorage.com`, R2's standard
 * S3-compatible endpoint). Writes only under a throwaway `tenants/test-<id>/`
 * prefix and a sibling `tenants/test-<id>/` prefix used purely to prove
 * deletion does not spill outside the prefix it was asked for; both are
 * deleted again before the script exits.
 */
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const bucket = process.env.R2_BACKUP_BUCKET;
const accessKeyId = process.env.R2_BACKUP_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_BACKUP_SECRET_ACCESS_KEY;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!bucket || !accessKeyId || !secretAccessKey || !accountId) {
  console.error(
    "Missing one of R2_BACKUP_BUCKET / R2_BACKUP_ACCESS_KEY_ID / R2_BACKUP_SECRET_ACCESS_KEY / " +
      "CLOUDFLARE_ACCOUNT_ID — source ~/upready/.env.keys first.",
  );
  process.exit(1);
}

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

const tenantId = `test-${randomUUID()}`;
const siblingId = `test-${randomUUID()}`;
const prefix = `tenants/${tenantId}/`;
const siblingPrefix = `tenants/${siblingId}/`;

const listByPrefix = async (p) => {
  const keys = [];
  let ContinuationToken;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: p, ContinuationToken }));
    for (const o of res.Contents ?? []) {
      if (o.Key) keys.push(o.Key);
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
};

const deleteByPrefix = async (p) => {
  const keys = await listByPrefix(p);
  if (keys.length === 0) {
    return 0;
  }
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
    );
  }
  return keys.length;
};

const put = (key) =>
  client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from("tenant-files-r2-check"),
      ContentType: "text/plain",
    }),
  );

async function main() {
  let failed = false;
  const check = (label, condition) => {
    console.log(`${condition ? "PASS" : "FAIL"}: ${label}`);
    if (!condition) failed = true;
  };

  console.log(`bucket=${bucket} endpoint=${endpoint}`);
  console.log(`tenant prefix under test: ${prefix}`);
  console.log(`sibling prefix (must survive the delete below): ${siblingPrefix}`);

  await put(`${prefix}a.txt`);
  await put(`${prefix}b.txt`);
  await put(`${siblingPrefix}c.txt`);
  console.log("uploaded 2 objects under the test prefix, 1 under the sibling prefix");

  const listed = await listByPrefix(prefix);
  console.log(`listTenantFiles-equivalent: ${listed.length} object(s) — ${listed.join(", ")}`);
  check("lists exactly the 2 objects just uploaded", listed.length === 2);

  const deletedCount = await deleteByPrefix(prefix);
  console.log(`deleteTenantFiles-equivalent: { deleted: ${deletedCount} }`);
  check("delete reports deleted=2", deletedCount === 2);

  const afterDelete = await listByPrefix(prefix);
  check("test prefix is empty after delete", afterDelete.length === 0);

  const siblingStill = await listByPrefix(siblingPrefix);
  check("sibling prefix still has its 1 object", siblingStill.length === 1);

  await deleteByPrefix(siblingPrefix);
  console.log("cleaned up the sibling prefix");

  if (failed) {
    console.error("\nRESULT: FAIL");
    process.exitCode = 1;
  } else {
    console.log("\nRESULT: PASS");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
