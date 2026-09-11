import { CORE_LAYOUT_IDS } from "@medusajs/admin-shared"

import { useMe } from "../../../hooks/api/users"
import { ChangePasswordSection } from "./components/change-password-section"
import { ProfileGeneralSection } from "./components/profile-general-section"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { LayoutComposer } from "../../../components/layout-composer"

// tenant-panel wave 2, piece 4: drops `ProfileMfaSection` (no MFA backend
// route in `/tenants/*`) and adds `ChangePasswordSection`, its own component
// (no Admin counterpart — the Admin only ever changes a password through the
// unauthenticated reset-password link flow), below the general section.

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
          <>
            <LayoutComposer.Entry id="ProfileGeneralSection">
              <ProfileGeneralSection user={user} />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ChangePasswordSection">
              <ChangePasswordSection />
            </LayoutComposer.Entry>
          </>
        ),
      }}
    />
  )
}
