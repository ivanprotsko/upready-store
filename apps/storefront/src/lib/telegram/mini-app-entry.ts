/**
 * What a page does once when it opens inside the shop's Mini App, kept apart
 * from the component that runs it (`modules/telegram/components/mini-app-bridge`)
 * so the order of the steps has its own tests.
 *
 * A page opened by a browser never gets here, because the bridge stops at
 * `isTelegramLaunch()`. A launch with no `initData` stops at the first line
 * below. In both cases nothing is asked of the server and no cookie changes.
 */

export type MiniAppEntryResult = { signedIn: boolean; cartAdopted: boolean }

export type MiniAppEntryDeps = {
  /** `Telegram.WebApp.initData` of this launch; empty when Telegram gave none. */
  initData: string | undefined
  /** The silent sign-in runs once per webview session. */
  signInDone: () => boolean
  markSignInDone: () => void
  /** The server action. It opens the bot's cart, then signs in when asked to. */
  enter: (initData: string, signIn: boolean) => Promise<MiniAppEntryResult>
  /** The page was server-rendered before either step. */
  refresh: () => void
}

export async function runMiniAppEntry(deps: MiniAppEntryDeps): Promise<void> {
  if (!deps.initData) {
    return
  }
  const signIn = !deps.signInDone()
  if (signIn) {
    deps.markSignInDone()
  }
  try {
    const { signedIn, cartAdopted } = await deps.enter(deps.initData, signIn)
    if (signedIn || cartAdopted) {
      deps.refresh()
    }
  } catch (error) {
    console.error("[mini-app] entry failed:", error)
  }
}

/**
 * Lets one component wait for another's work. The checkout entry page
 * (`app/[locale]/(main)/mini/checkout`) must not open the checkout before the
 * bridge has switched the cart, and must not wait forever when the bridge
 * cannot finish, so the wait has a bound.
 */
export function createEntrySignal() {
  let settle: () => void = () => {}
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })

  return {
    /** The entry is over, whatever its outcome. */
    mark: () => settle(),
    /** Resolves when the entry is over, or after `timeoutMs` at the latest. */
    wait: (timeoutMs: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs)
        settled.then(() => {
          clearTimeout(timer)
          resolve()
        })
      }),
  }
}

/** One signal per page load. The bridge marks it, the checkout entry waits for it. */
export const miniAppEntry = createEntrySignal()
