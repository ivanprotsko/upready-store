import { SettingsDetailSection } from "../../../../components/settings"
import { SingleColumnPage } from "../../../../components/layout/pages"
import { ManualPaymentCard } from "./manual-payment-card"
import { usePreNoticeSection } from "./payment-pre-notice-card"

// t-2026-10-14-01 (panel redesign, G3): «Перевод по реквизитам» on its own
// address, so the list's row has a card to open. Until its own rebuild lands
// (line us-8: requisites list with «…», two drawers, NoRecords), the page is
// today's card unchanged, plus the transfer's notice before payment as a read
// section with the shared drawer `pre-notice/edit` — the notice used to be
// edited in the one card under the payment forms, which is gone. Nothing the
// owner can do with transfers today is lost; us-8 replaces this component,
// the address stays.

export const ManualPaymentPage = () => {
  const preNotice = usePreNoticeSection("manual")

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <ManualPaymentCard />
      {preNotice.isPending ? null : <SettingsDetailSection section={preNotice.section} />}
    </SingleColumnPage>
  )
}
