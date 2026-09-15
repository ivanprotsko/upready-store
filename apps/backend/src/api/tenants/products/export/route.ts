import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { exportFilename, snapshotToCsv } from "../../../../product-csv/serialize";
import { loadCsvContext } from "../csv-context";

/**
 * `GET /tenants/products/export` — the shop's whole catalogue as one CSV,
 * answered as the FILE (t14-product-import, step 1).
 *
 * Why the bytes and not a `{ url }` the way `POST /tenants/orders/export`
 * answers: this file is the import's contract, and the round trip has to be
 * checkable. Handing back the bytes makes "export, edit, import" one request
 * each and keeps the download inside the panel's own authenticated fetch. The
 * orders export has a second reason for its shape that does not apply here —
 * it stores the file so the Admin's copied screen can open a URL — and the file
 * module's local provider answers URLs on port 9000 whatever port the backend
 * listens on (see the note in that route), which would make a stand's download
 * link dead.
 *
 * Column contract, quoting and escaping: `src/product-csv/columns.ts` and
 * `src/product-csv/csv.ts`. The file is written with a BOM and `;` separators
 * because that is what Excel in a Russian locale opens without a wizard, and
 * the importer accepts both separators and either BOM state on the way back.
 *
 * Scope is the tenant-product link, the same one `GET /tenants/products` uses:
 * a product another tenant owns is not in the snapshot, so it cannot be in the
 * file.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { tenant, snapshot } = await loadCsvContext(req);

  const csv = snapshotToCsv(snapshot);
  const filename = exportFilename(tenant.handle, new Date());

  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  // The panel reads it to count the rows it downloaded without parsing the body.
  res.setHeader("x-product-count", String(snapshot.products.length));
  res.setHeader("access-control-expose-headers", "content-disposition, x-product-count");

  res.status(200).send(csv);
};
