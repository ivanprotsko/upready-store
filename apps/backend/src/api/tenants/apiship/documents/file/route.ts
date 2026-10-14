import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { downloadDocument } from "../../../../../apiship/orders";
import { apishipApiCredentials, readApishipSecret } from "../../../../../tenant-secrets/apiship";
import { getTenantScope } from "../../../tenant-scope";

/**
 * `GET /tenants/apiship/documents/file?url=<storage link>&name=<file name>` —
 * the bytes of a document ApiShip generated, through this backend
 * (t-2026-10-14-58). The link comes from `POST /tenants/apiship/documents`;
 * only ApiShip's own storage host is fetched (`downloadDocument` refuses any
 * other), so this is not an open proxy. The owner's session is required, the
 * way every `/tenants/*` route is.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const query = req.query as Record<string, unknown>;
  const url = String(query.url ?? "").trim();
  if (!/^https?:\/\//.test(url)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите ссылку на документ ApiShip.");
  }

  const api = apishipApiCredentials(await readApishipSecret(pg, tenant.id));
  if (!api) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "ApiShip не подключён в этом магазине");
  }

  let document: { bytes: Buffer; contentType: string };
  try {
    document = await downloadDocument(api, url);
  } catch (error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Не удалось скачать документ: ${(error as Error).message}`);
  }

  const requested = String(query.name ?? "").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const extension = document.contentType.includes("pdf") ? "pdf" : document.contentType.includes("sheet") ? "xlsx" : "bin";
  const name = requested || `apiship-${new Date().toISOString().slice(0, 10)}.${extension}`;

  res.setHeader("Content-Type", document.contentType);
  res.setHeader("Content-Length", String(document.bytes.length));
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.status(200).send(document.bytes);
};
