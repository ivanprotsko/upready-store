import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { useTenantLocaleSettings } from "./locale-settings"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel wave 2, piece 7: content pages. No Admin counterpart — the
// native Admin has no per-store content sections — so this module is the
// panel's own, written in the shape every other hooks/api module here has
// (queryKeysFactory + sdk.client.fetch + invalidation on success).
// Contract: docs/tenant-panel/api-contract.md, "Piece 7: content pages".
//
// t05-page-keys (2026-09-16): the backend's `key` stopped being one of five
// fixed words and became a free slug per tenant; `RESERVED_PAGE_KEYS` is that
// original five, now just the panel's own defaults (label, hint, permanence),
// not the whole vocabulary. `TenantPage.key` is `string`.

export const RESERVED_PAGE_KEYS = [
  "contacts",
  "legal",
  "about",
  "privacy",
  "offer",
] as const

export type ReservedPageKey = (typeof RESERVED_PAGE_KEYS)[number]

/**
 * `id: null` is a reserved section the tenant has never saved. `GET
 * /tenants/pages` always answers all five of those, so the list screen
 * renders the full set without knowing the vocabulary itself, plus every
 * custom page the tenant already created (never `id: null`, since a custom
 * page only appears once `POST /tenants/pages` made it exist).
 *
 * `reserved` tells the panel whether the slug is one of the five: it decides
 * whether a delete button and a slug-rename field make sense at all.
 */
export type TenantPage = {
  id: string | null
  key: string
  locale: string
  title: string
  body: string
  published: boolean
  in_footer: boolean
  footer_order: number | null
  seo_title: string | null
  seo_description: string | null
  reserved: boolean
}

export type TenantPageListResponse = { pages: TenantPage[] }
export type TenantPageResponse = { page: TenantPage }

export type PutTenantPageBody = {
  title: string
  body: string
  published: boolean
  in_footer: boolean
  footer_order?: number | null
  locale?: string
  seo_title?: string | null
  seo_description?: string | null
}

export type CreateTenantPageBody = {
  slug: string
  title: string
}

/**
 * The language the shop's pages are edited in (o21-owner-panel-ux). Without a
 * `locale` the backend answers and saves the `en` row, while a shop whose
 * language is Russian shows its buyers the `ru` row: the owner edited
 * «Контакты», saw «Страница сохранена», and the shop did not change (measured
 * by `e2e/owner-page-flow.e2e.mjs`). The panel now reads and writes the row of
 * the shop's own default language (`ru` when the shop never chose one); until
 * that is known nothing is asked, so the wrong row is never shown first.
 */
const usePageLocale = () => {
  const { locale_settings: settings, isSuccess, isError } = useTenantLocaleSettings()
  // A shop that never saved its languages runs on the platform's default, `ru`.
  return { locale: isError ? undefined : settings?.default_locale ?? "ru", ready: isSuccess || isError }
}

const PAGES_QUERY_KEY = "tenant-pages" as const
export const pagesQueryKeys = queryKeysFactory(PAGES_QUERY_KEY)

export const useTenantPages = (
  options?: Omit<
    UseQueryOptions<
      TenantPageListResponse,
      FetchError,
      TenantPageListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { locale, ready } = usePageLocale()
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantPageListResponse>("/tenants/pages", {
        query: locale ? { locale } : undefined,
      }),
    queryKey: pagesQueryKeys.list({ locale }),
    ...options,
    enabled: ready && (options?.enabled ?? true),
  })

  return { ...data, ...rest }
}

export const useTenantPage = (
  key: string,
  options?: Omit<
    UseQueryOptions<TenantPageResponse, FetchError, TenantPageResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { locale, ready } = usePageLocale()
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantPageResponse>(`/tenants/pages/${key}`, {
        query: locale ? { locale } : undefined,
      }),
    queryKey: pagesQueryKeys.detail(key, { locale }),
    ...options,
    enabled: ready && (options?.enabled ?? true),
  })

  return { ...data, ...rest }
}

export const useCreateTenantPage = (
  options?: UseMutationOptions<TenantPageResponse, FetchError, CreateTenantPageBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantPageResponse>("/tenants/pages", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: pagesQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateTenantPage = (
  key: string,
  options?: UseMutationOptions<TenantPageResponse, FetchError, PutTenantPageBody>
) => {
  const { locale } = usePageLocale()
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantPageResponse>(`/tenants/pages/${key}`, {
        method: "PUT",
        body: { ...payload, locale: payload.locale ?? locale },
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: pagesQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: pagesQueryKeys.detail(key) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteTenantPage = (
  key: string,
  options?: UseMutationOptions<
    { id: string; object: string; deleted: boolean },
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ id: string; object: string; deleted: boolean }>(
        `/tenants/pages/${key}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: pagesQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
