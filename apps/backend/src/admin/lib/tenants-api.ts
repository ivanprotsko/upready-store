/**
 * Typed fetch helpers for the platform-owner "tenants" (shops) admin API.
 *
 * Contract: docs/multitenancy/admin-tenants-api-contract.md (owner: W1, this worker builds
 * against it and verifies against the live backend).
 *
 * The admin UI runs on the same origin as the API, so every call is a plain `fetch` with
 * `credentials: "include"` — `@medusajs/js-sdk` is not installed in this app.
 */

export type TenantSalesChannel = {
  id: string
  name: string
  is_disabled: boolean
}

export type TenantApiKey = {
  id: string
  token: string
  revoked_at: string | null
}

export type TenantSummary = {
  id: string
  handle: string
  name: string
  metadata: Record<string, unknown> | null
  archived_at: string | null
  created_at: string
  updated_at: string
  sales_channel: TenantSalesChannel | null
  api_key: TenantApiKey | null
  admins_count: number
  products_count: number
  orders_count: number
}

export type TenantAdmin = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  /** t-2026-10-07-11: `owner`, `manager` or `operator`; absent from a backend without roles. */
  role?: string
  created_at: string
  updated_at: string
}

export type TenantDetail = TenantSummary & { admins: TenantAdmin[] }

export type TenantArchivedFilter = "exclude" | "include" | "only"

export type ListTenantsParams = {
  q?: string
  limit?: number
  offset?: number
  archived?: TenantArchivedFilter
}

export type ListTenantsResponse = {
  tenants: TenantSummary[]
  count: number
  offset: number
  limit: number
}

export type CreateTenantAdminInput = {
  email: string
  password: string
  /** Without it the backend creates an owner, as before roles. */
  role?: string
  first_name?: string
  last_name?: string
}

export type CreateTenantInput = {
  name: string
  handle: string
  admin: CreateTenantAdminInput
}

export type UpdateTenantInput = {
  name?: string
  metadata?: Record<string, unknown> | null
}

export type UpdateTenantAdminInput = {
  email?: string
  password?: string
  role?: string
  first_name?: string
  last_name?: string
}

export type DeleteTenantResponse = {
  id: string
  object: "tenant"
  deleted: boolean
  archived_at: string | null
}

export type DeleteTenantAdminResponse = {
  id: string
  object: "tenant_admin"
  deleted: boolean
}

class TenantsApiError extends Error {}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { message?: string } | null
    if (body && typeof body.message === "string" && body.message.length > 0) {
      return body.message
    }
  } catch {
    // response body was not JSON — fall through to the generic message
  }
  return `Request failed with status ${res.status}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  })

  if (!res.ok) {
    throw new TenantsApiError(await parseErrorMessage(res))
  }

  if (res.status === 204) {
    return undefined as T
  }

  return (await res.json()) as T
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

export async function listTenants(
  params: ListTenantsParams = {}
): Promise<ListTenantsResponse> {
  const qs = buildQuery({
    q: params.q,
    limit: params.limit,
    offset: params.offset,
    archived: params.archived,
  })
  return request<ListTenantsResponse>(`/admin/tenants${qs}`)
}

export async function createTenant(input: CreateTenantInput): Promise<TenantDetail> {
  const { tenant } = await request<{ tenant: TenantDetail }>("/admin/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return tenant
}

export async function getTenant(id: string): Promise<TenantDetail> {
  const { tenant } = await request<{ tenant: TenantDetail }>(`/admin/tenants/${id}`)
  return tenant
}

export async function updateTenant(
  id: string,
  input: UpdateTenantInput
): Promise<TenantDetail> {
  const { tenant } = await request<{ tenant: TenantDetail }>(`/admin/tenants/${id}`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  return tenant
}

export async function deleteTenant(
  id: string,
  purgeFiles = false
): Promise<DeleteTenantResponse> {
  const qs = purgeFiles ? "?purge_files=true" : ""
  return request<DeleteTenantResponse>(`/admin/tenants/${id}${qs}`, { method: "DELETE" })
}

export async function listTenantAdmins(id: string): Promise<TenantAdmin[]> {
  const { admins } = await request<{ admins: TenantAdmin[] }>(`/admin/tenants/${id}/admins`)
  return admins
}

export async function createTenantAdmin(
  id: string,
  input: CreateTenantAdminInput
): Promise<TenantAdmin> {
  const { admin } = await request<{ admin: TenantAdmin }>(`/admin/tenants/${id}/admins`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  return admin
}

export async function updateTenantAdmin(
  id: string,
  adminId: string,
  input: UpdateTenantAdminInput
): Promise<TenantAdmin> {
  const { admin } = await request<{ admin: TenantAdmin }>(
    `/admin/tenants/${id}/admins/${adminId}`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
  return admin
}

export async function deleteTenantAdmin(
  id: string,
  adminId: string
): Promise<DeleteTenantAdminResponse> {
  return request<DeleteTenantAdminResponse>(`/admin/tenants/${id}/admins/${adminId}`, {
    method: "DELETE",
  })
}

/** Owner of the route is W3 (export); triggers a browser download of the gzip bundle. */
export async function exportTenant(id: string, handle: string): Promise<void> {
  const res = await fetch(`/admin/tenants/${id}/export`, {
    method: "POST",
    credentials: "include",
  })

  if (!res.ok) {
    throw new TenantsApiError(await parseErrorMessage(res))
  }

  const blob = await res.blob()
  const disposition = res.headers.get("content-disposition") ?? ""
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] ?? `tenant-${handle}.json.gz`

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** `handle` rule from the contract: lowercase letters, digits, single hyphens, 3-63 chars. */
export const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function validateHandle(handle: string): string | null {
  if (handle.length < 3 || handle.length > 63) {
    return "Домен должен быть от 3 до 63 символов."
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "Только строчные латинские буквы, цифры и одиночные дефисы (без дефиса в начале/конце)."
  }
  return null
}
