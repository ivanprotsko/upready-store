"use client"

import { useState } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ForgotPassword from "@modules/account/components/forgot-password"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot-password",
}

/**
 * `siteName` comes from the server page (`account/@login/page.tsx`) as a PROP:
 * this whole tree is client, and `Register` below needs the tenant's name in
 * its copy, so it must never import the `next/headers`-reading accessor
 * directly (rule 19g).
 */
const LoginTemplate = ({ siteName }: { siteName: string }) => {
  const [currentView, setCurrentView] = useState<LOGIN_VIEW>(
    LOGIN_VIEW.SIGN_IN
  )

  return (
    <div className="w-full flex justify-center px-8 py-8">
      {currentView === LOGIN_VIEW.SIGN_IN && (
        <Login setCurrentView={setCurrentView} />
      )}
      {currentView === LOGIN_VIEW.REGISTER && (
        <Register setCurrentView={setCurrentView} siteName={siteName} />
      )}
      {currentView === LOGIN_VIEW.FORGOT_PASSWORD && (
        <ForgotPassword setCurrentView={setCurrentView} />
      )}
    </div>
  )
}

export default LoginTemplate
