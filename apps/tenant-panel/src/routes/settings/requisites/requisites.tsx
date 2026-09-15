import { useEffect, useRef, useState } from "react"
import { Badge, Button, Container, Heading, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  type PutRequisitesBody,
  type Requisites,
  useRequisites,
  useUpdateRequisites,
} from "../../../hooks/api/requisites"

// Реквизиты продавца (t12-legal-requisites): значения, которые на витрине
// заполняют {{ТОКЕНЫ}}, оставленные в оферте, политике конфиденциальности и
// контактах. Каждое поле необязательно — придумывать регистрационные данные
// нельзя, поэтому незаполненное поле не блокирует сохранение, а просто
// остаётся в списке «Не заполнено» ниже.
//
// Как на экране уведомлений (правило 19h): пока запись грузится, поля
// настоящие, только выключенные, а не абзац вместо них, и ответ заполняет
// форму только пока владелец её не трогал (touchedRef) — медленный ответ не
// затирает набранное.

type Draft = { [K in keyof Requisites]: Requisites[K] extends boolean ? boolean : string }

const EMPTY_DRAFT: Draft = {
  legal_name: "",
  inn: "",
  ogrn: "",
  legal_address: "",
  return_address: "",
  phone: "",
  phone_confirmed: false,
  email: "",
  dpo_email: "",
  delivery_methods: "",
  effective_date: "",
  revision_date: "",
  document_date: "",
  rkn_notice_date: "",
  rkn_reg_number: "",
  newsletter_management_url: "",
  bank_details: "",
}

const toDraft = (requisites: Requisites | undefined): Draft =>
  requisites
    ? {
        legal_name: requisites.legal_name ?? "",
        inn: requisites.inn ?? "",
        ogrn: requisites.ogrn ?? "",
        legal_address: requisites.legal_address ?? "",
        return_address: requisites.return_address ?? "",
        phone: requisites.phone ?? "",
        phone_confirmed: requisites.phone_confirmed,
        email: requisites.email ?? "",
        dpo_email: requisites.dpo_email ?? "",
        delivery_methods: requisites.delivery_methods ?? "",
        effective_date: requisites.effective_date ?? "",
        revision_date: requisites.revision_date ?? "",
        document_date: requisites.document_date ?? "",
        rkn_notice_date: requisites.rkn_notice_date ?? "",
        rkn_reg_number: requisites.rkn_reg_number ?? "",
        newsletter_management_url: requisites.newsletter_management_url ?? "",
        bank_details: requisites.bank_details ?? "",
      }
    : EMPTY_DRAFT

type FieldDef = { key: keyof Omit<Draft, "phone_confirmed">; label: string; hint?: string }

const FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Регистрация",
    fields: [
      { key: "legal_name", label: "ФИО ИП или название организации" },
      { key: "inn", label: "ИНН" },
      { key: "ogrn", label: "ОГРНИП / ОГРН" },
      { key: "legal_address", label: "Юридический адрес" },
    ],
  },
  {
    title: "Контакты и доставка",
    fields: [
      { key: "phone", label: "Телефон" },
      { key: "email", label: "E-mail" },
      { key: "return_address", label: "Адрес возврата" },
      { key: "delivery_methods", label: "Способы доставки", hint: "Например: СДЭК, Почта России" },
    ],
  },
  {
    title: "Персональные данные",
    fields: [
      { key: "dpo_email", label: "E-mail ответственного за обработку персональных данных" },
      { key: "rkn_reg_number", label: "Регистрационный номер в реестре Роскомнадзора" },
      { key: "rkn_notice_date", label: "Дата уведомления Роскомнадзора" },
    ],
  },
  {
    title: "Даты документов",
    fields: [
      { key: "document_date", label: "Дата документа" },
      { key: "effective_date", label: "Дата вступления документа в силу" },
      { key: "revision_date", label: "Дата редакции документа" },
    ],
  },
  {
    title: "Прочее",
    fields: [
      { key: "newsletter_management_url", label: "Ссылка на управление рассылками" },
      { key: "bank_details", label: "Банковские реквизиты", hint: "Публикуются, только если вы сами их здесь укажете." },
    ],
  },
]

export const RequisitesSettings = () => {
  const { t } = useTranslation()
  const { requisites, domain, missing, isPending, isError, error } = useRequisites()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) return
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft(toDraft(requisites))
    }
  }, [isPending, requisites])

  const { mutateAsync: save, isPending: isSaving } = useUpdateRequisites()

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
    const payload: PutRequisitesBody = {
      ...draft,
      phone: draft.phone.trim(),
    }
    await save(payload, {
      onSuccess: (response) => {
        touchedRef.current = false
        setDraft(toDraft(response.requisites))
        toast.success("Реквизиты сохранены")
      },
      onError: (saveError) => toast.error(saveError.message),
    })
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>Реквизиты продавца</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            Эти данные подставляются вместо {"{{ТОКЕНОВ}}"} в публичной оферте, политике
            конфиденциальности и контактах магазина. Незаполненное поле остаётся на странице
            видимым плейсхолдером — так владелец и покупатель видят, что документ не закончен.
          </Text>
        </div>

        <div className="flex flex-col gap-y-4 px-6 py-6">
          <div className="flex items-center justify-between">
            <Text weight="plus">Не заполнено</Text>
            {loaded ? (
              <Badge size="2xsmall" color={missing?.length ? "orange" : "green"} data-testid="missing-state">
                {missing?.length ? `${missing.length}` : "всё заполнено"}
              </Badge>
            ) : null}
          </div>
          {loaded && missing?.length ? (
            <ul className="flex flex-col gap-y-1" data-testid="missing-list">
              {missing.map((item) => (
                <li key={item.token} className="text-ui-fg-subtle txt-compact-small">
                  <span className="text-ui-fg-base">{item.label}</span>
                  {item.pages.length ? (
                    <span> — нужен на странице: {item.pages.map((page) => page.title).join(", ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {loaded && !missing?.length ? (
            <Text size="small" className="text-ui-fg-subtle">
              Все 16 значений заполнены, включая домен сайта.
            </Text>
          ) : null}
          <Text size="xsmall" className="text-ui-fg-subtle" data-testid="resolved-domain">
            Домен сайта ({"{{ДОМЕН_САЙТА}}"}) определяется автоматически: {domain || "—"}
          </Text>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-8 px-6 py-6">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-y-4">
              <Text weight="plus" size="small">
                {group.title}
              </Text>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {group.fields.map((field) => (
                  <div key={field.key} className="flex flex-col gap-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    {field.key === "bank_details" ? (
                      <Textarea
                        id={field.key}
                        name={field.key}
                        rows={3}
                        value={draft[field.key]}
                        disabled={busy}
                        onChange={(event) => update(field.key, event.target.value)}
                      />
                    ) : (
                      <Input
                        id={field.key}
                        name={field.key}
                        autoComplete="off"
                        value={draft[field.key]}
                        disabled={busy}
                        onChange={(event) => update(field.key, event.target.value)}
                      />
                    )}
                    {field.hint ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {field.hint}
                      </Text>
                    ) : null}
                    {field.key === "phone" && draft.phone && !draft.phone_confirmed ? (
                      <div className="flex items-center gap-x-2">
                        <Badge size="2xsmall" color="orange">
                          требует подтверждения
                        </Badge>
                        <button
                          type="button"
                          className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-xsmall-plus"
                          onClick={() => update("phone_confirmed", true)}
                          disabled={busy}
                          data-testid="confirm-phone"
                        >
                          подтвердить
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy}>
              {t("actions.save", { defaultValue: "Сохранить" })}
            </Button>
          </div>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
