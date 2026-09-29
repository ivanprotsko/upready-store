import { useEffect, useRef, useState } from "react"
import { Alert, Badge, Button, Input, Label, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  useDeleteMarketplaceKey,
  useSaveMarketplaceKey,
  type MarketplaceCard,
} from "../../../../hooks/api/marketplaces"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"

/**
 * «Ключ API» — the owner connects this marketplace herself
 * (w24-integration-keys-self-service).
 *
 * Ivan's order of 2026-09-16 11:37 WITA: «мы делаем SaaS-продукт, пользователи
 * должны иметь возможность указать свои ключи для всех сервисов». Until this
 * card the panel printed a shell command at the shop owner, which is a thing
 * she never runs, so the product could only be connected by us.
 *
 * NOTHING HERE KNOWS A MARKETPLACE. The fields, their labels, their hints and
 * which of them are secret come from `card.connection.fields`, which the
 * backend builds from the adapter's `credentialFields`. Wildberries has one
 * field and Ozon has two; a third marketplace gets this form by being
 * registered in the backend (rule 20).
 *
 * Rule 19h shapes the loading and the race, the same way the Robokassa form
 * does: the REAL inputs render (disabled while a save is in flight) instead of
 * a paragraph in their place, and a background refresh of the card may refill
 * the draft only while the owner has not typed into it (`touchedRef`).
 *
 * A stored secret is never sent back, so an empty secret field means «keep
 * what is stored», and the placeholder says so. A non-secret field (Ozon's
 * Client-Id) shows its value, because the owner has to see which cabinet this
 * shop is bound to.
 */

const emptyDraft = (card: MarketplaceCard): Record<string, string> =>
  Object.fromEntries(
    (card.connection.fields ?? []).map((field) => [
      field.name,
      field.secret ? "" : (field.value ?? ""),
    ])
  )

export const MpKeyForm = ({ card }: { card: MarketplaceCard }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const fields = card.connection.fields ?? []

  const [draft, setDraft] = useState<Record<string, string>>(() => emptyDraft(card))
  const touchedRef = useRef(false)

  useEffect(() => {
    if (!touchedRef.current) {
      setDraft(emptyDraft(card))
    }
  }, [card])

  const { mutateAsync: save, isPending: isSaving } = useSaveMarketplaceKey(card.id)
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteMarketplaceKey(card.id)

  const busy = isSaving || isRemoving
  const stored = card.connection.key.set
  // Stored but not decryptable on this server (46df D1): nothing usable, yet a
  // row exists, so the owner can overwrite it or remove it.
  const unreadable = Boolean(card.connection.key.unreadable)

  const update = (name: string, value: string) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [name]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    // A secret left empty means «keep the stored value», so it is LEFT OUT of
    // the body; an empty string would be a value of the same quantity and
    // would overwrite a working key with nothing (rule 20a).
    const body = Object.fromEntries(
      fields
        .map((field) => [field.name, (draft[field.name] ?? "").trim()] as const)
        .filter(([, value]) => value.length > 0)
    )

    const missing = fields.filter(
      (field) => !body[field.name] && !(field.secret && field.masked?.set)
    )
    if (missing.length) {
      toast.error(
        t("marketplaces.key.form.missing", {
          fields: missing.map((field) => field.label).join(", "),
        })
      )
      return
    }

    try {
      const saved = await save(body)
      touchedRef.current = false
      setDraft(
        Object.fromEntries(
          saved.fields.map((field) => [field.name, field.secret ? "" : (field.value ?? "")])
        )
      )
      toast.success(
        t("marketplaces.key.form.saved", { last4: saved.connection.key.last4 ?? "" })
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("marketplaces.key.form.removeTitle", { label: card.label }),
      description: t("marketplaces.key.form.removeDescription"),
      confirmText: t("marketplaces.key.form.remove"),
      cancelText: t("marketplaces.key.form.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      await remove()
      touchedRef.current = false
      setDraft({})
      toast.success(t("marketplaces.key.form.removed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * A key carrying write rights is STORED and used for reads only — the
   * product does not write to marketplaces (Ivan, 2026-09-16 02:46 WITA).
   * Saying so beats refusing the key: the owner would otherwise be sent back
   * to the marketplace to mint a second token for no gain.
   */
  const writeRights = stored && card.credentials?.read_only === false

  /**
   * The per-field badge only where it says something the header does not.
   * Wildberries has ONE field, so the two badges stood one line apart saying
   * the same thing (measured on the stand at 390×844: the header one wrapped
   * across the paragraph beside it). Ozon has two fields, and there the badge
   * answers «which of them is stored».
   */
  const showFieldState = fields.filter((entry) => entry.secret).length > 1

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <Text weight="plus">{t("marketplaces.key.form.title")}</Text>
          <Text className="text-ui-fg-subtle" size="small">
            {card.connection.key.how_to_store}
          </Text>
        </div>
        <Badge
          size="2xsmall"
          color={unreadable ? "red" : stored ? "green" : "grey"}
          className="shrink-0 whitespace-nowrap"
          data-testid={`mp-key-state-${card.id}`}
        >
          {unreadable
            ? t("integrations.state.unreadable")
            : stored
              ? t("marketplaces.key.set", { last4: card.connection.key.last4 })
              : t("marketplaces.key.missing")}
        </Badge>
      </div>

      {unreadable ? <UnreadableSecretAlert testId={`mp-key-unreadable-${card.id}`} /> : null}

      {writeRights ? (
        <Alert variant="warning">{t("marketplaces.key.form.writeRights")}</Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${card.id}-${field.name}`}>{field.label}</Label>
                {field.secret && showFieldState ? (
                  <Badge size="2xsmall" color={field.masked?.set ? "green" : "grey"}>
                    {field.masked?.set
                      ? t("marketplaces.key.set", { last4: field.masked.last4 ?? "" })
                      : t("marketplaces.key.missing")}
                  </Badge>
                ) : null}
              </div>
              <Input
                id={`${card.id}-${field.name}`}
                name={field.name}
                data-testid={`mp-key-input-${card.id}-${field.name}`}
                type={field.secret ? "password" : "text"}
                autoComplete={field.secret ? "new-password" : "off"}
                value={draft[field.name] ?? ""}
                disabled={busy}
                onChange={(event) => update(field.name, event.target.value)}
                placeholder={
                  field.secret && field.masked?.set
                    ? t("marketplaces.key.form.keepPlaceholder")
                    : t("marketplaces.key.form.emptyPlaceholder")
                }
              />
              <Text className="text-ui-fg-subtle" size="small">
                {field.hint}{" "}
                <a
                  className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  href={field.doc_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("marketplaces.key.form.docs")}
                </a>
              </Text>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-x-2">
          <Button
            type="submit"
            size="small"
            isLoading={isSaving}
            disabled={busy}
            data-testid={`mp-key-save-${card.id}`}
          >
            {t("marketplaces.key.form.save")}
          </Button>
          {stored || unreadable ? (
            <Button
              type="button"
              size="small"
              variant="danger"
              isLoading={isRemoving}
              disabled={busy}
              onClick={handleRemove}
              data-testid={`mp-key-remove-${card.id}`}
            >
              {t("marketplaces.key.form.remove")}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
