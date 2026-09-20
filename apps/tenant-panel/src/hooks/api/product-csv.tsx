import { FetchError } from "@medusajs/js-sdk"
import {
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { productsQueryKeys } from "./products"

/**
 * Catalogue export and import (t14-product-import). No Admin counterpart the
 * panel could copy: the native Admin's import starts a background workflow and
 * tells the staff member to wait for a notification, and the panel has no
 * notification feed (same reason the orders export was reshaped in
 * `orders.tsx`).
 *
 * Two shapes worth knowing before reading the code:
 *
 * THE EXPORT ANSWERS THE FILE, not a URL. `sdk.client.fetch` hands back the raw
 * `Response` whenever the request did not ask for JSON, so the CSV is read as
 * text and saved from the browser. That keeps the download inside the panel's
 * own authenticated fetch instead of a URL a file provider signed.
 *
 * THE IMPORT IS TWO CALLS. The upload plans and writes nothing; the confirm
 * applies. In between, the plan lives in a row the backend keeps, which is what
 * makes the report survive a page reload — the screen reads it back by id.
 */

export type ImportRowAction =
  | "create"
  | "create_variant"
  | "update"
  | "unchanged"
  | "reject"

export type ImportFieldChange = { field: string; from: string; to: string }

export type ImportRowError = { code: string; message: string; column?: string }

export type ImportImageOutcome = { url: string; ok: boolean; error?: string }

export type ImportRow = {
  line: number
  action: ImportRowAction
  handle: string | null
  sku: string | null
  title: string | null
  planned_handle?: string
  changes: ImportFieldChange[]
  notes: string[]
  errors: ImportRowError[]
  image_urls: string[]
  images?: ImportImageOutcome[]
  applied?: boolean
  apply_error?: string
}

export type ImportReport = {
  status: "pending" | "rejected" | "applied" | "partially_applied" | "cancelled"
  filename: string
  bytes: number
  delimiter: string
  bom: boolean
  encoding: "utf-8" | "utf-8-bom" | "windows-1251"
  summary: {
    rows: number
    create: number
    create_variant: number
    update: number
    unchanged: number
    reject: number
    images: number
    images_failed?: number
  }
  fatal: { code: string; message: string; line?: number }[]
  unknown_columns: string[]
  categories_to_create: string[]
  currencies: string[]
  limits: { max_bytes: number; max_rows: number }
  rows: ImportRow[]
  stopped_at_line?: number
}

export type TenantProductImport = {
  id: string
  filename: string
  bytes: number
  status: string
  delimiter: string
  created_at: string | null
  updated_at: string | null
  confirmed_at: string | null
  report: ImportReport | null
}

export type TenantProductImportResponse = { product_import: TenantProductImport }

export type TenantProductImportListResponse = {
  product_imports: TenantProductImport[]
  limits: { max_bytes: number; max_rows: number }
}

const PRODUCT_IMPORT_QUERY_KEY = "product-imports" as const
export const productImportQueryKeys = queryKeysFactory(PRODUCT_IMPORT_QUERY_KEY)

export const useProductImports = (
  options?: Omit<
    UseQueryOptions<
      TenantProductImportListResponse,
      FetchError,
      TenantProductImportListResponse
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: productImportQueryKeys.list(),
    queryFn: () =>
      sdk.client.fetch<TenantProductImportListResponse>("/tenants/products/import", {
        method: "GET",
      }),
    ...options,
  })

  return { ...data, ...rest }
}

/** The stored plan, read back by id — this is what survives a page reload. */
export const useProductImport = (
  id: string,
  options?: Omit<
    UseQueryOptions<TenantProductImportResponse, FetchError, TenantProductImportResponse>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: productImportQueryKeys.detail(id),
    queryFn: () =>
      sdk.client.fetch<TenantProductImportResponse>(`/tenants/products/import/${id}`, {
        method: "GET",
      }),
    ...options,
  })

  return { product_import: data?.product_import, ...rest }
}

/**
 * Uploads the file and returns the DRY RUN. Nothing is written by this call.
 *
 * The body is multipart with the field name `files`, which is what the backend's
 * reused multer middleware parses (`src/api/middlewares.ts`).
 *
 * `content-type: null` is not a stray value: the SDK defaults the header to
 * `application/json` and then JSON-stringifies any body that carries it, which
 * would send the string `[object FormData]`. Passing `null` is how the SDK's
 * own `admin.upload.create` clears it («let the browser determine the content
 * type») — the boundary a multipart body needs can only be produced by `fetch`.
 */
export const useUploadProductImport = (
  options?: UseMutationOptions<TenantProductImportResponse, FetchError, File>
) => {
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append("files", file, file.name)

      return sdk.client.fetch<TenantProductImportResponse>("/tenants/products/import", {
        method: "POST",
        headers: { "content-type": null } as unknown as Record<string, string>,
        body,
      })
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productImportQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** Applies a pending plan. The only call in this module that writes. */
export const useConfirmProductImport = (
  id: string,
  options?: UseMutationOptions<TenantProductImportResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<TenantProductImportResponse>(
        `/tenants/products/import/${id}/confirm`,
        { method: "POST" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productImportQueryKeys.all })
      // The catalogue changed, so every product list and detail is stale.
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteProductImport = (
  id: string,
  options?: UseMutationOptions<{ id: string; deleted: boolean }, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ id: string; deleted: boolean }>(
        `/tenants/products/import/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productImportQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export type ProductCsvExport = { filename: string; text: string; count: number }

/**
 * Downloads the catalogue CSV. `accept: text/csv` is what makes the SDK hand
 * back the raw `Response` instead of trying to parse JSON, and the filename
 * comes from `content-disposition` so the saved file is named the way the
 * backend named it.
 */
export const useExportProductsCsv = (
  options?: UseMutationOptions<ProductCsvExport, FetchError, void>
) => {
  return useMutation({
    mutationFn: async () => {
      const response = (await sdk.client.fetch("/tenants/products/export", {
        method: "GET",
        headers: { accept: "text/csv" },
      })) as unknown as Response

      const text = await response.text()
      const disposition = response.headers.get("content-disposition") ?? ""
      const match = disposition.match(/filename="([^"]+)"/)

      return {
        filename: match?.[1] ?? "catalog.csv",
        text,
        count: Number(response.headers.get("x-product-count") ?? 0),
      }
    },
    ...options,
  })
}
