import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../../modules/tenant";
import type TenantModuleService from "../../../../../../modules/tenant/service";
import { applyImport } from "../../../../../../product-csv/apply";
import { parseCsv } from "../../../../../../product-csv/csv";
import { planImport } from "../../../../../../product-csv/plan";
import { readRows } from "../../../../../../product-csv/rows";
import {
  recountSummary,
  resolveNewIdentities,
} from "../../../../../../product-csv/uniqueness";
import { loadCsvContext, loadOwnImport } from "../../../csv-context";
import { toImportDto } from "../../import-helpers";

/**
 * `POST /tenants/products/import/:import_id/confirm` — apply the upload
 * (t14-product-import). The ONLY route in this feature that writes to the
 * catalogue.
 *
 * The stored file is PARSED AND PLANNED AGAIN here, against the catalogue as it
 * stands at this moment, and the fresh plan is what gets applied. The report
 * the owner read minutes ago is a view, not an instruction: a product someone
 * edited in the panel in between must not be written over by a stale diff, and
 * a file that has become invalid in the meantime (a currency switched off, a
 * handle now taken) must be refused rather than half applied.
 *
 * A rejected or already-applied upload answers 409 rather than doing anything;
 * confirming twice is an accident, not an instruction to import twice.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const context = await loadCsvContext(req);
  const row = await loadOwnImport(req, req.params.import_id, context.tenant.id);
  const tenantModule: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const status = String(row.status ?? "pending");

  if (status !== "pending") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      status === "rejected"
        ? "Этот файл отклонён целиком — исправьте ошибки из отчёта и загрузите заново."
        : `Эта загрузка уже обработана (состояние «${status}»). Загрузите файл заново, если нужно применить его ещё раз.`,
    );
  }

  const parsed = parseCsv(String(row.source ?? ""));

  if (!parsed) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Сохранённый файл больше не читается. Загрузите его заново.",
    );
  }

  const file = readRows(parsed);

  const planned = planImport({
    file,
    snapshot: context.snapshot,
    allowedCurrencies: context.allowed_currencies,
    filename: String(row.filename ?? ""),
    bytes: Number(row.bytes ?? 0),
    bom: Boolean((row.report as { bom?: boolean } | null)?.bom),
    // `source` was stored already decoded and normalised, so the encoding is a
    // fact about the original upload, carried over from the first report.
    encoding:
      ((row.report as { encoding?: "utf-8-bom" | "utf-8" | "windows-1251" } | null)?.encoding) ??
      "utf-8",
    delimiter: parsed.delimiter,
  });

  const fresh =
    planned.fatal.length === 0
      ? recountSummary(
          await resolveNewIdentities({
            container: req.scope,
            report: planned,
            file,
            snapshot: context.snapshot,
          }),
        )
      : planned;

  // Something changed under the owner's feet between the dry run and now.
  // Store the new verdict so the screen shows what actually happened, and
  // write nothing.
  if (fresh.fatal.length > 0) {
    const updated = await tenantModule.updateTenantProductImports({
      id: String(row.id),
      status: "rejected",
      report: fresh,
    });

    const stored = Array.isArray(updated) ? updated[0] : updated;

    res.status(409).json({
      product_import: toImportDto(stored),
      message:
        "Файл больше нельзя применить: каталог изменился с момента проверки. Отчёт обновлён.",
    });
    return;
  }

  const applied = await applyImport({
    container: req.scope,
    tenantId: context.tenant.id,
    tenantAdminId: context.tenant_admin_id,
    report: fresh,
    file,
    snapshot: context.snapshot,
  });

  const updated = await tenantModule.updateTenantProductImports({
    id: String(row.id),
    status: applied.status,
    report: applied,
    confirmed_at: new Date(),
  });

  const stored = Array.isArray(updated) ? updated[0] : updated;

  res.status(200).json({ product_import: toImportDto(stored) });
};
