import { CORE_LAYOUT_IDS } from "@medusajs/admin-shared"

import { useMe } from "../../../hooks/api/users"
import { ProfileGeneralSection } from "./components/profile-general-section"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { LayoutComposer } from "../../../components/layout-composer"

// tenant-panel wave 2, piece 4: drops `ProfileMfaSection` (no MFA backend
// route in `/tenants/*`).
//
// o24-owner-profile (t-2026-09-24-n3): the separate password card is gone —
// Ivan's own words were to fold it into a «Пароль» row under «Электронная
// почта», with an «Изменить» button opening `routes/profile/password-edit`
// (the `password` child route) instead of a standing form. See
// `ProfileGeneralSection` for the row and the drawer for the form.

export const ProfileDetail = () => {
  const { user, isPending: isLoading, isError, error } = useMe()

  if (isLoading || !user) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  if (isError) {
    throw error
  }

  return (
    <LayoutComposer
      widgetsZonePrefix="profile.details"
      preferredLayoutId={CORE_LAYOUT_IDS.SINGLE_COLUMN}
      sections={{
        main: (
          <LayoutComposer.Entry id="ProfileGeneralSection">
            <ProfileGeneralSection user={user} />
          </LayoutComposer.Entry>
        ),
      }}
    />
  )
}
