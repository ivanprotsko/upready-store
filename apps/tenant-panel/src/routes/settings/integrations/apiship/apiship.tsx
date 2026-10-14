import { PencilSquare, Trash, TruckFast } from "@medusajs/icons"
import { Button, StatusBadge, toast, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { NoRecords } from "../../../../components/common/empty-table-content"
import { SecretValue, hideQuery } from "../../../../components/common/secret-value"
import { SingleColumnPageSkeleton } from "../../../../components/common/skeleton"
import { SingleColumnPage } from "../../../../components/layout/pages"
import {
  SettingsDetailSection,
  type SettingsRow,
  type SettingsSection,
  type SettingsStatus,
} from "../../../../components/settings"
import {
  useApiship,
  useApishipProbe,
  useDeleteApiship,
} from "../../../../hooks/api/apiship"
import { UnreadableSecretAlert } from "../components/unreadable-secret-alert"
import { ApishipDuplicates } from "./apiship-duplicates"
import { CabinetHint, methodsRows } from "./apiship-methods-rows"
import { connectionStatus, formatRub, probeVerdict, SENDER_FIELDS } from "./apiship-model"

/**
 * «Подключения → ApiShip» (t-2026-10-14-58, part B): the shop's ApiShip
 * connection, sender, parcel defaults, checkout methods, markup and the
 * service address, after the settings pattern of t-2026-10-14-01 — the page
 * only reads, each section is edited in its own drawer on `edit/<section>`.
 *
 * THREE STATES of the token, never two (rule 19h / 20a): not entered, ApiShip
 * has not answered yet, and ApiShip's own verdict. The verdict and the tariff
 * check are their own queries, so a slow or dead ApiShip never holds the page.
 * The token and the webhook address (it carries a token) are never on screen
 * in full: the last four characters, and `SecretValue`.
 */
export const ApishipIntegration = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const { apiship, isPending, isError, error } = useApiship()
  const settings = apiship?.settings ?? null
  const stored = settings?.token.set ?? false

  const { result: probe, isFetching: isProbing } = useApishipProbe({}, { enabled: stored })
  // The quote takes seconds and costs ApiShip calls: only on the owner's click.
  const [wantsTariffs, setWantsTariffs] = useState(false)
  const {
    result: quote,
    isFetching: isQuoting,
    refetch: requote,
  } = useApishipProbe({ calculator: true }, { enabled: stored && wantsTariffs })

  const { mutateAsync: remove } = useDeleteApiship()

  if (isError) {
    throw error
  }

  if (isPending || !apiship) {
    return <SingleColumnPageSkeleton sections={6} />
  }

  // A new shop (E8): one card that says what appears after connecting and one
  // button to the connection drawer. No «—» rows: the sections come once a
  // token is saved.
  if (!settings && !apiship.unreadable) {
    return (
      <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
        <SettingsDetailSection
          level="h1"
          section={{
            id: "connection",
            title: t("integrations.apiship.title"),
            description: t("integrations.apiship.subtitle"),
            status: connectionStatus(t, apiship),
            actions: [],
            rows: [],
            body: (
              <NoRecords
                icon={<TruckFast className="text-ui-fg-subtle" />}
                title={t("integrations.apiship.emptyTitle")}
                message={t("integrations.apiship.emptyMessage")}
                action={{ to: "edit/connection", label: t("integrations.apiship.connect") }}
                className="h-auto px-6 py-10 text-center"
              />
            ),
          }}
        />
      </SingleColumnPage>
    )
  }

  const missing = new Set(apiship.missing)
  const needed: SettingsStatus = { color: "orange", label: t("integrations.apiship.neededToShip") }

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("integrations.apiship.removeTitle"),
      description: t("integrations.apiship.removeDescription"),
      verificationText: "ApiShip",
      verificationInstruction: t("general.typeToConfirm"),
      confirmText: t("integrations.apiship.remove"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) return
    try {
      await remove()
      toast.success(t("integrations.apiship.removed"))
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : String(removeError))
    }
  }

  const verdict = probeVerdict(t, { stored, isProbing, probe })
  const connections = probe?.connections ?? []

  const connection: SettingsSection = {
    id: "connection",
    title: t("integrations.apiship.title"),
    description: t("integrations.apiship.subtitle"),
    status: connectionStatus(t, apiship),
    actions: [
      {
        actions: [
          { label: t("actions.change"), to: "edit/connection", icon: <PencilSquare /> },
        ],
      },
      ...(settings || apiship.unreadable
        ? [{ actions: [{ label: t("integrations.apiship.remove"), icon: <Trash />, onClick: handleRemove }] }]
        : []),
    ],
    rows: [
      {
        id: "token",
        label: t("integrations.apiship.tokenLabel"),
        value: stored ? `••••${settings?.token.last4 ?? ""}` : undefined,
        mono: true,
        status: stored ? undefined : { color: "orange", label: t("integrations.apiship.tokenMissing") },
        hint: t("integrations.apiship.tokenHint"),
      },
      ...(verdict ? [{ id: "probe", label: t("integrations.apiship.probeLabel"), status: verdict }] : []),
      ...(probe?.probe?.ok
        ? [
            {
              id: "connections",
              label: t("integrations.apiship.connectionsLabel"),
              value: connections.length ? (
                <div className="flex flex-wrap gap-2" data-testid="apiship-connections">
                  {connections.map((entry) => (
                    <StatusBadge key={entry.id} color="green">
                      {entry.test ? t("integrations.apiship.connectionTest", { label: entry.label }) : entry.label}
                    </StatusBadge>
                  ))}
                </div>
              ) : undefined,
              status: connections.length
                ? undefined
                : { color: "orange" as const, label: t("integrations.apiship.noConnections") },
              hint: <CabinetHint />,
            },
          ]
        : []),
      ...(apiship.test_contour
        ? [
            {
              id: "contour",
              label: t("integrations.apiship.contourLabel"),
              status: { color: "blue" as const, label: t("integrations.apiship.testContour") },
              hint: t("integrations.apiship.testContourHint"),
            },
          ]
        : []),
    ],
  }

  const senderRow = (field: (typeof SENDER_FIELDS)[number]): SettingsRow => {
    const value = settings?.[field]
    if (field === "sender_mode") {
      return {
        id: field,
        label: t(`integrations.apiship.sender.${field}`),
        value: t(`integrations.apiship.senderMode.${settings?.sender_mode ?? "courier"}`),
      }
    }
    return {
      id: field,
      label: t(`integrations.apiship.sender.${field}`),
      value: value === null || value === undefined ? undefined : String(value),
      mono: field === "sender_index" || field === "sender_point_id",
      status: missing.has(field) ? needed : undefined,
    }
  }

  const senderMissing = SENDER_FIELDS.filter((field) => missing.has(field))
  const sender: SettingsSection = {
    id: "sender",
    title: t("integrations.apiship.sections.sender"),
    description: t("integrations.apiship.sections.senderHint"),
    editTo: "edit/sender",
    status: !settings
      ? undefined
      : senderMissing.length
        ? {
            color: "orange",
            label: t("integrations.apiship.senderMissing", {
              fields: senderMissing.map((field) => t(`integrations.apiship.sender.${field}`)).join(", "),
            }),
          }
        : { color: "green", label: t("integrations.apiship.senderReady") },
    rows: SENDER_FIELDS.filter(
      (field) => field !== "sender_point_id" || settings?.sender_mode === "point"
    ).map(senderRow),
  }

  const parcel: SettingsSection = {
    id: "parcel",
    title: t("integrations.apiship.sections.parcel"),
    description: t("integrations.apiship.sections.parcelHint"),
    editTo: "edit/parcel",
    rows: [
      {
        id: "weight",
        label: t("integrations.apiship.parcel.weight"),
        value: settings ? t("integrations.apiship.parcel.grams", { value: settings.default_weight_g }) : undefined,
      },
      {
        id: "size",
        label: t("integrations.apiship.parcel.size"),
        value: settings
          ? t("integrations.apiship.parcel.cm", {
              length: settings.default_length_cm,
              width: settings.default_width_cm,
              height: settings.default_height_cm,
            })
          : undefined,
      },
    ],
  }

  const methods: SettingsSection = {
    id: "methods",
    title: t("integrations.apiship.sections.methods"),
    description: t("integrations.apiship.sections.methodsHint"),
    editTo: "edit/methods",
    action: stored ? (
      <Button
        size="small"
        variant="secondary"
        isLoading={isQuoting}
        onClick={() => (wantsTariffs ? requote() : setWantsTariffs(true))}
        data-testid="apiship-check-tariffs"
      >
        {t("integrations.apiship.checkTariffs")}
      </Button>
    ) : undefined,
    rows: methodsRows({ t, apiship, probe, quote: wantsTariffs ? quote : undefined }),
  }

  const { pricing } = apiship
  const markup: SettingsSection = {
    id: "markup",
    title: t("integrations.apiship.sections.markup"),
    description: t("integrations.apiship.sections.markupHint"),
    editTo: "edit/markup",
    rows: [
      { id: "markup_amount", label: t("integrations.apiship.markup.amount"), value: formatRub(pricing.markup_amount) },
      { id: "markup_percent", label: t("integrations.apiship.markup.percent"), value: `${pricing.markup_percent} %` },
      {
        id: "free_above_total",
        label: t("integrations.apiship.markup.freeAbove"),
        value: pricing.free_above_total ? formatRub(pricing.free_above_total) : undefined,
        hint: pricing.free_above_total ? undefined : t("integrations.apiship.markup.freeAboveNone"),
      },
    ],
  }

  const service: SettingsSection = {
    id: "service",
    title: t("integrations.apiship.sections.service"),
    description: t("integrations.apiship.sections.serviceHint"),
    actions: [],
    rows: [
      {
        id: "webhook",
        label: t("integrations.apiship.webhookLabel"),
        value: apiship.webhook_url ? (
          <SecretValue value={apiship.webhook_url} hidden={hideQuery(apiship.webhook_url)} testId="apiship-webhook" />
        ) : undefined,
        status: !settings
          ? undefined
          : settings.webhook_registered
            ? { color: "green", label: t("integrations.apiship.webhookRegistered") }
            : { color: "orange", label: t("integrations.apiship.webhookNotRegistered") },
        hint: settings && !settings.webhook_registered ? t("integrations.apiship.webhookPollHint") : undefined,
      },
    ],
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      {apiship.unreadable ? <UnreadableSecretAlert testId="apiship-unreadable" /> : null}
      <SettingsDetailSection section={connection} level="h1" />
      <ApishipDuplicates duplicates={apiship.duplicates} />
      {[sender, parcel, methods, markup, service].map((section) => (
        <SettingsDetailSection key={section.id} section={section} />
      ))}
    </SingleColumnPage>
  )
}
