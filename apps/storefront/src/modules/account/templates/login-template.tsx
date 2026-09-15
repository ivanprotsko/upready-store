"use client"

import { useState } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ForgotPassword from "@modules/account/components/forgot-password"
import type { LegalLinkContext } from "@lib/util/legal-links"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot-password",
}

/**
 * `siteName` comes from the server page (`account/@login/page.tsx`) as a PROP:
 * this whole tree is client, and `Register` below needs the tenant's name in
 * its copy, so it must never import the `next/headers`-reading accessor
 * directly (rule 19g). `legal` travels the same way, for the same reason: the
 * signup consent sentence links the shop's own documents
 * (f05-checkout-legal-stubs).
 */
const LoginTemplate = ({
  siteName,
  legal,
}: {
  siteName: string
  legal: LegalLinkContext
}) => {
  const [currentView, setCurrentView] = useState<LOGIN_VIEW>(
    LOGIN_VIEW.SIGN_IN
  )

  return (
    <div className="w-full flex justify-center px-8 py-8">
      {currentView === LOGIN_VIEW.SIGN_IN && (
        <Login setCurrentView={setCurrentView} />
      )}
      {currentView === LOGIN_VIEW.REGISTER && (
        <Register
          setCurrentView={setCurrentView}
          siteName={siteName}
          legal={legal}
        />
      )}
      {currentView === LOGIN_VIEW.FORGOT_PASSWORD && (
        <ForgotPassword setCurrentView={setCurrentView} />
      )}
    </div>
  )
}

export default LoginTemplate
