// Read-only: object count + total bytes of the R2_BACKUP_* bucket.
// SDK resolved by absolute path per the brief, not a bare import (not a dependency of this app).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdkPath = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../node_modules/.pnpm/@aws-sdk+client-s3@3.1094.0/node_modules/@aws-sdk/client-s3"
);
const { S3Client, ListObjectsV2Command } = require(sdkPath);

const bucket = process.env.R2_BACKUP_BUCKET;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_BACKUP_SECRET_ACCESS_KEY,
  },
});

let token;
let count = 0;
let bytes = 0;
do {
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })
  );
  for (const obj of res.Contents || []) {
    count += 1;
    bytes += obj.Size || 0;
  }
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);

console.log(`bucket=${bucket} endpoint=${endpoint}`);
console.log(`objects=${count} bytes=${bytes}`);
