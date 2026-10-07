import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { CreateStaffBody, StaffMember, StaffRoleGrant, UpdateStaffBody } from "../../lib/staff"

// t-2026-10-07-11: the shop's staff logins, `/tenants/staff*`. No Admin
// counterpart: the Admin's users are the platform's, a shop's logins are its
// own rows with a role each. Every route needs the `staff` permission; the
// platform's own row never comes back in the list.

/** `roles`: every role with what it opens, in the order `owner`, `manager`, `operator`. */
export type StaffListResponse = { staff: StaffMember[]; roles?: StaffRoleGrant[] }
export type StaffMemberResponse = { staff_member: StaffMember }
export type StaffDeleteResponse = { id: string; object: "tenant_admin"; deleted: boolean }

const STAFF_QUERY_KEY = "tenant-staff" as const
export const staffQueryKeys = queryKeysFactory(STAFF_QUERY_KEY)

export const useStaff = (
  options?: Omit<
    UseQueryOptions<StaffListResponse, FetchError, StaffListResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<StaffListResponse>("/tenants/staff"),
    queryKey: staffQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateStaff = (
  options?: UseMutationOptions<StaffMemberResponse, FetchError, CreateStaffBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<StaffMemberResponse>("/tenants/staff", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateStaff = (
  options?: UseMutationOptions<
    StaffMemberResponse,
    FetchError,
    { id: string; body: UpdateStaffBody }
  >
) => {
  return useMutation({
    mutationFn: ({ id, body }) =>
      sdk.client.fetch<StaffMemberResponse>(`/tenants/staff/${id}`, {
        method: "POST",
        body,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteStaff = (
  options?: UseMutationOptions<StaffDeleteResponse, FetchError, string>
) => {
  return useMutation({
    mutationFn: (id) =>
      sdk.client.fetch<StaffDeleteResponse>(`/tenants/staff/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
