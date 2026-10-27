import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useMutation, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// t-2026-10-27-04: «Изменения агента». The owner's agent (voice, Telegram, the
// panel) never writes the live site directly: it makes a changeset, shows it
// on the stage copy of the site, and the owner publishes or rolls it back here.
// Routes: GET/POST /tenants/agent-changesets, GET /tenants/agent-changesets/:id,
// POST …/:id/{stage,publish,rollback,discard}. `:id` may be `latest`.

export const CHANGESET_STATUSES = ["draft", "staged", "published", "rolled_back", "discarded"] as const
export type ChangesetStatus = (typeof CHANGESET_STATUSES)[number]

export const CHANGESET_SOURCES = ["owner-voice", "telegram", "panel"] as const
export type ChangesetSource = (typeof CHANGESET_SOURCES)[number]

export const CHANGESET_KINDS = [
  "home",
  "branding",
  "page-create",
  "page",
  "article-create",
  "article",
  "product",
  "variant",
  "attributes",
] as const
export type ChangesetKind = (typeof CHANGESET_KINDS)[number]

export type SiteLinks = { main_url: string | null; stage_url: string | null }

export type AgentChangesetSummary = {
  id: string
  status: ChangesetStatus
  source: ChangesetSource
  summary: string | null
  author_email: string | null
  op_count: number
  /** Kinds of the ops; `denied` for an op the allow-list no longer allows. */
  op_kinds: (ChangesetKind | "denied")[]
  created_at: string | null
  staged_at: string | null
  published_at: string | null
  rolled_back_at: string | null
  discarded_at: string | null
}

export type FieldChange = { field: string; before: unknown; after: unknown }

export type AgentChangesetOp = {
  index: number
  method: string
  path: string
  kind: ChangesetKind | null
  scope: "site" | "product" | null
  /** Where the storefront shows the op's target: `/`, `/pages/about`, `/products/tea`. */
  preview_path: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  changes: FieldChange[]
}

export type AgentChangeset = AgentChangesetSummary & {
  ops: AgentChangesetOp[]
  result?: unknown
  /**
   * A published one: the targets changed on the live site since, which a
   * rollback refuses (409 `drift`). Empty when a rollback can go ahead, `null`
   * when not published or not checked.
   */
  drift: ChangesetDrift[] | null
}

export type AgentChangesetListResponse = {
  agent_changesets: AgentChangesetSummary[]
  count: number
  offset: number
  limit: number
  sites: SiteLinks
}

export type AgentChangesetResponse = { agent_changeset: AgentChangeset; sites: SiteLinks }

export type AgentChangesetListQuery = {
  status?: ChangesetStatus
  limit?: number
  offset?: number
}

/** One op whose target changed on the live site after publishing (409 `drift`). */
export type ChangesetDrift = {
  op_index: number
  method: string
  path: string
  before: Record<string, unknown> | null
  now: Record<string, unknown> | null
}

export const CHANGESET_ACTIONS = ["stage", "publish", "rollback", "discard"] as const
export type ChangesetAction = (typeof CHANGESET_ACTIONS)[number]

const QUERY_KEY = "tenant-agent-changesets" as const
export const agentChangesetsQueryKeys = queryKeysFactory(QUERY_KEY)

const buildQuery = (query: AgentChangesetListQuery): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

export const useAgentChangesets = (
  query: AgentChangesetListQuery = {},
  options?: Omit<
    UseQueryOptions<AgentChangesetListResponse, FetchError, AgentChangesetListResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<AgentChangesetListResponse>(`/tenants/agent-changesets${buildQuery(query)}`),
    queryKey: agentChangesetsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useAgentChangeset = (id: string) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<AgentChangesetResponse>(`/tenants/agent-changesets/${id}`),
    queryKey: agentChangesetsQueryKeys.detail(id),
  })

  return { ...data, ...rest }
}

/** Stage, publish, roll back or discard one changeset; every list and card reloads after. */
export const useAgentChangesetAction = (id: string) =>
  useMutation<{ agent_changeset: AgentChangesetSummary }, FetchError, ChangesetAction>({
    mutationFn: (action) =>
      sdk.client.fetch(`/tenants/agent-changesets/${id}/${action}`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: agentChangesetsQueryKeys.all }),
  })
