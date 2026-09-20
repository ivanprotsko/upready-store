import { useEffect, useRef, useState } from "react"
import { Button, Container, Heading, Hint, Input, Label, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  useTenantSeoVerification,
  useUpdateTenantSeoVerification,
} from "../../../hooks/api/seo-verification"

// b10-panel-gaps: the two search-console ownership codes. `PUT
// /tenants/seo-verification` shipped with t11-seo-redirects and the owner had
// nowhere to paste a code, so the storefront's `<head>` never carried one.
//
// Same rule-19h shape as ../analytics/analytics.tsx: the real controls render
// disabled while the record loads (never a skeleton that swallows a click), and
// `touchedRef` keeps a slow answer from overwriting what the owner has typed.

type Draft = { yandex: string; google: string }

const EMPTY_DRAFT: Draft = { yandex: "", google: "" }

export const SeoVerification = () => {
  const { t } = useTranslation()
  const { seo_verification: saved, isPending, isError, error } = useTenantSeoVerification()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft({ yandex: saved?.yandex ?? "", google: saved?.google ?? "" })
    }
  }, [isPending, saved])

  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantSeoVerification()

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    await save(
      { yandex: draft.yandex.trim(), google: draft.google.trim() },
      {
        onSuccess: (response) => {
          touchedRef.current = false
          setDraft({
            yandex: response.seo_verification.yandex ?? "",
            google: response.seo_verification.google ?? "",
          })
          toast.success(t("seoVerification.saved"))
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{t("seoVerification.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("seoVerification.subtitle")}
          </Text>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="yandex">{t("seoVerification.yandex.label")}</Label>
              <Input
                id="yandex"
                name="yandex"
                autoComplete="off"
                value={draft.yandex}
                disabled={busy}
                onChange={(event) => update("yandex", event.target.value)}
                placeholder={
                  loaded === null ? t("seoVerification.loading") : "a1b2c3d4e5f60718"
                }
                className="font-mono"
              />
              <Hint>{t("seoVerification.yandex.hint")}</Hint>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="google">{t("seoVerification.google.label")}</Label>
              <Input
                id="google"
                name="google"
                autoComplete="off"
                value={draft.google}
                disabled={busy}
                onChange={(event) => update("google", event.target.value)}
                placeholder={
                  loaded === null
                    ? t("seoVerification.loading")
                    : "QWErty1234567890abcdefGH_ijklMNOpqrs"
                }
                className="font-mono"
              />
              <Hint>{t("seoVerification.google.hint")}</Hint>
            </div>
          </div>

          <Text size="small" className="text-ui-fg-subtle">
            {t("seoVerification.hint")}
          </Text>

          <div>
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy}>
              {t("seoVerification.save")}
            </Button>
          </div>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
