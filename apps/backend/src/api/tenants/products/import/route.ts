import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { BOM, normalizeText, parseCsv } from "../../../../product-csv/csv";
import { MAX_FILE_BYTES, MAX_ROWS, planImport } from "../../../../product-csv/plan";
import type { ImportReport } from "../../../../product-csv/plan";
import { readRows } from "../../../../product-csv/rows";
import { recountSummary, resolveNewIdentities } from "../../../../product-csv/uniqueness";
import { getTenantScope } from "../../tenant-scope";
import { loadCsvContext } from "../csv-context";
import { toImportDto } from "./import-helpers";

/**
 * `POST /tenants/products/import` — upload a catalogue file and get a DRY RUN
 * (t14-product-import, step 2). Nothing is written here, ever: the answer is a
 * per-row report the owner reads before deciding, and
 * `POST /tenants/products/import/:id/confirm` is the only route that writes.
 *
 * Multipart, field name `files`, parsed by the Admin's own multer middleware
 * array the way `POST /tenants/uploads` does it (`src/api/middlewares.ts`
 * explains why that array is reused rather than a parser of our own).
 *
 * The report is stored in `tenant_product_import` together with the file, so a
 * page reload does not lose it and `confirm` can re-plan against the catalogue
 * as it stands at that moment instead of replaying a stale diff.
 *
 * A file with a fatal error (a duplicate row, a duplicate column, an unknown
 * currency, over the limits) is stored with `status: "rejected"` and can never
 * be confirmed. Half a catalogue is worse than none.
 */

type UploadedFile = { originalname: string; mimetype: string; buffer: Buffer };

/** What an XLSX, an ODS or a ZIP starts with. Recognised to answer usefully. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** What an old binary .xls starts with (OLE2 compound file). */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const files = (req as unknown as { files?: UploadedFile[] }).files;
  const file = files?.[0];

  if (!file) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Файл не пришёл. Выберите CSV-файл и загрузите его ещё раз.",
    );
  }

  if (file.buffer.byteLength === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Файл пустой.");
  }

  if (file.buffer.byteLength > MAX_FILE_BYTES) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Файл весит ${Math.round(file.buffer.byteLength / 1024 / 1024)} МБ, предел — ${Math.round(
        MAX_FILE_BYTES / 1024 / 1024,
      )} МБ. Разделите его на части.`,
    );
  }

  if (
    file.buffer.subarray(0, 4).equals(ZIP_MAGIC) ||
    file.buffer.subarray(0, 4).equals(OLE_MAGIC)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Это файл Excel (XLSX или XLS), а импорт читает CSV. В Excel: «Файл» → «Сохранить как» → «CSV UTF-8 (разделитель — запятая)».",
    );
  }

  const context = await loadCsvContext(req);
  const raw = file.buffer.toString("utf8");
  const bom = raw.startsWith(BOM);
  const source = normalizeText(raw);
  const parsed = parseCsv(source);

  const parsedRows = parsed ? readRows(parsed) : null;

  let report: ImportReport = parsed && parsedRows
    ? planImport({
        file: parsedRows,
        snapshot: context.snapshot,
        allowedCurrencies: context.allowed_currencies,
        filename: file.originalname,
        bytes: file.buffer.byteLength,
        bom,
        delimiter: parsed.delimiter,
      })
    : {
        status: "rejected",
        filename: file.originalname,
        bytes: file.buffer.byteLength,
        delimiter: ";",
        bom,
        summary: {
          rows: 0,
          create: 0,
          create_variant: 0,
          update: 0,
          unchanged: 0,
          reject: 0,
          images: 0,
        },
        fatal: [
          {
            code: "empty_file",
            message: "В файле нет ни одной строки с данными.",
          },
        ],
        unknown_columns: [],
        categories_to_create: [],
        currencies: [],
        limits: { max_bytes: MAX_FILE_BYTES, max_rows: MAX_ROWS },
        rows: [],
      };

  // Product codes and SKUs are unique platform-wide, so whether a new row can
  // be created at all is a question only the whole `product` table can answer
  // (`product-csv/uniqueness.ts`). It runs on the dry run, not at write time,
  // so a taken code is a line in the report rather than a database error
  // halfway through the file.
  if (parsedRows && report.fatal.length === 0) {
    report = recountSummary(
      await resolveNewIdentities({
        container: req.scope,
        report,
        file: parsedRows,
        snapshot: context.snapshot,
      }),
    );
  }

  const tenantModule: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const created = await tenantModule.createTenantProductImports({
    tenant_id: context.tenant.id,
    filename: file.originalname,
    bytes: file.buffer.byteLength,
    status: report.status,
    delimiter: report.delimiter,
    source,
    report,
  });

  const row = Array.isArray(created) ? created[0] : created;

  res.status(200).json({ product_import: toImportDto(row) });
};

/**
 * `GET /tenants/products/import` — this shop's own uploads, newest first,
 * without their file bodies. The panel opens the newest pending one when the
 * owner comes back to the screen.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  // `getTenantScope` rather than `loadCsvContext`: a list of uploads needs the
  // tenant, not the whole catalogue snapshot the planner reads.
  const tenant = await getTenantScope(req);
  const tenantModule: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModule.listTenantProductImports({ tenant_id: tenant.id });

  const imports = rows
    .map((row) => toImportDto(row))
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));

  res.status(200).json({
    product_imports: imports,
    limits: { max_bytes: MAX_FILE_BYTES, max_rows: MAX_ROWS },
  });
};
