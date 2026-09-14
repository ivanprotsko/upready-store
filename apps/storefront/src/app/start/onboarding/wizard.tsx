"use client"

import { useState } from "react"

import { Steps } from "../components"
import styles from "../demo.module.css"
import { THEME_IDS, THEME_LABELS } from "@lib/theme/presets.generated"

const STEP_LABELS = ["Магазин", "Доступ", "Оформление"]

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
}

/**
 * A shop name turned into the subdomain it will answer on. Deliberately a
 * SUGGESTION: the field stays editable, because a transliteration nobody can
 * override would put a name on the URL bar that its owner never agreed to.
 */
function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => (ch in CYRILLIC ? CYRILLIC[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}

const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type Created = {
  handle: string
  name: string
  storefrontUrl: string | null
  storefrontHost: string | null
  panelUrl: string | null
  themeApplied: boolean
  themeProblem: string | null
  catalogSeeded: boolean
  catalogProducts: number
  catalogProblem: string | null
}

export default function Wizard({ paidLine }: { paidLine: string | null }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [handleTouched, setHandleTouched] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [preset, setPreset] = useState<string>("geist")
  const [mode, setMode] = useState<"light" | "dark">("light")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)

  const effectiveHandle = handleTouched ? handle : suggestHandle(name)
  const handleValid =
    HANDLE_RE.test(effectiveHandle) && effectiveHandle.length >= 3 && effectiveHandle.length <= 63

  async function create() {
    setBusy(true)
    setFailure(null)
    try {
      const response = await fetch("/api/demo/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, handle: effectiveHandle, email, password, preset, mode }),
      })
      const body = (await response.json()) as Created & { message?: string }
      if (!response.ok) {
        console.error("demo onboarding failed", response.status, body)
        setFailure(body.message ?? `Магазин не создан (ответ ${response.status}).`)
        return
      }
      setCreated(body)
    } catch (error) {
      console.error("demo onboarding failed", error)
      setFailure("Сервер не ответил. Попробуйте ещё раз.")
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div data-testid="demo-onboarding-done">
        <div className={styles.lede}>
          <h1>«{created.name}» создан</h1>
          <p>
            Витрина уже отвечает по своему адресу. Сертификат выпускается автоматически — обычно
            около минуты после создания.
          </p>
        </div>

        <div className={styles.links}>
          {created.storefrontUrl ? (
            <div className={styles.linkRow}>
              <span className={`${styles.dot} ${styles.dotLive}`} />
              <span className={styles.body}>
                <strong>Ваша витрина</strong>
                <span>{created.storefrontHost}</span>
              </span>
              <a
                className={`${styles.btn} ${styles.btnPrimary}`}
                href={created.storefrontUrl}
                data-testid="demo-done-storefront"
              >
                Открыть
              </a>
            </div>
          ) : (
            <div className={`${styles.banner} ${styles.bannerError}`}>
              <span className={`${styles.dot} ${styles.dotError}`} />
              <span>
                Магазин <code>{created.handle}</code> создан, но стенд собран без базового домена
                (<code>DEMO_TENANT_BASE_DOMAIN</code>), поэтому адрес витрины здесь назвать нечем.
              </span>
            </div>
          )}

          {created.panelUrl ? (
            <div className={styles.linkRow}>
              <span className={styles.dot} />
              <span className={styles.body}>
                <strong>Панель управления</strong>
                <span>{created.panelUrl.replace(/^https?:\/\//, "")}</span>
              </span>
              <a className={`${styles.btn} ${styles.btnSecondary}`} href={created.panelUrl}>
                Войти
              </a>
            </div>
          ) : null}
        </div>

        {created.themeProblem ? (
          <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginTop: 24 }}>
            <span className={`${styles.dot} ${styles.dotError}`} />
            <span>
              Магазин создан, но оформление не применилось: {created.themeProblem}. Его можно
              выбрать в панели.
            </span>
          </div>
        ) : null}

        {created.catalogSeeded ? (
          <div className={styles.banner} style={{ marginTop: 24 }} data-testid="demo-catalog-seeded">
            <span className={styles.dot} />
            <span>
              Каталог наполнен стартовым набором: {created.catalogProducts} товаров в пяти категориях,
              картинки — абстрактные формы. Замените их своими товарами в панели, входом{" "}
              <code>{created.handle ? email : ""}</code>.
            </span>
          </div>
        ) : (
          <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginTop: 24 }} data-testid="demo-catalog-empty">
            <span className={`${styles.dot} ${styles.dotError}`} />
            <span>
              Каталог пустой: стартовый набор не засеялся
              {created.catalogProblem ? ` (${created.catalogProblem})` : ""}. Товары, категории и свой
              домен добавляются в панели, входом <code>{created.handle ? email : ""}</code>.
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-testid="demo-onboarding-wizard">
      <Steps labels={STEP_LABELS} current={step} />

      {paidLine ? (
        <div className={styles.banner} data-testid="demo-onboarding-paid">
          <span className={`${styles.dot} ${styles.dotLive}`} />
          <span>{paidLine}</span>
        </div>
      ) : null}

      {failure ? (
        <div className={`${styles.banner} ${styles.bannerError}`} data-testid="demo-onboarding-error">
          <span className={`${styles.dot} ${styles.dotError}`} />
          <span>{failure}</span>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          <div className={styles.lede}>
            <h1>Настройки вашего магазина</h1>
            <p>
              Название видно покупателям в шапке и во вкладке браузера. Адрес — поддомен, который
              заработает сразу после создания.
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="shop-name">Название магазина</label>
            <input
              id="shop-name"
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Бархат и сталь"
              data-testid="demo-shop-name"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="shop-handle">Адрес магазина</label>
            <div className={styles.prefixed}>
              <input
                id="shop-handle"
                className={`${styles.input} ${styles.inputMono}`}
                value={effectiveHandle}
                onChange={(event) => {
                  setHandleTouched(true)
                  setHandle(event.target.value.toLowerCase())
                }}
                placeholder="barhat-i-stal"
                data-testid="demo-shop-handle"
              />
              <span className={styles.suffix}>
                .{process.env.NEXT_PUBLIC_DEMO_TENANT_BASE_DOMAIN || "shipshift.dev"}
              </span>
            </div>
            <span className={`${styles.hint} ${effectiveHandle && !handleValid ? styles.hintError : ""}`}>
              Строчные латинские буквы, цифры и дефис, 3–63 знака. Позже к магазину можно привязать
              свой домен.
            </span>
          </div>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge} ${styles.btnBlock}`}
            disabled={!name.trim() || !handleValid}
            onClick={() => setStep(2)}
            data-testid="demo-step1-next"
          >
            Дальше · доступ
          </button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className={styles.lede}>
            <h1>Вход владельца</h1>
            <p>
              Этой парой вы войдёте в панель управления магазином — там товары, заказы и домены.
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="owner-email">Почта</label>
            <input
              id="owner-email"
              className={`${styles.input} ${styles.inputMono}`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
              data-testid="demo-owner-email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="owner-password">Пароль</label>
            <input
              id="owner-password"
              className={`${styles.input} ${styles.inputMono}`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="demo-owner-password"
            />
            <span className={styles.hint}>Не короче восьми знаков.</span>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setStep(1)}
            >
              Назад
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary} ${styles.grow}`}
              disabled={!email.includes("@") || password.length < 8}
              onClick={() => setStep(3)}
              data-testid="demo-step2-next"
            >
              Дальше · оформление
            </button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className={styles.lede}>
            <h1>Как магазин будет выглядеть</h1>
            <p>
              Выбор можно поменять в панели в любой момент. Он сохраняется в документ главной
              страницы магазина.
            </p>
          </div>

          <div className={styles.swatches} data-testid="demo-presets">
            {THEME_IDS.map((id) => (
              <button
                type="button"
                key={id}
                className={`${styles.swatch} ${preset === id ? styles.swatchSelected : ""}`}
                onClick={() => setPreset(id)}
                data-testid={`demo-preset-${id}`}
              >
                {/* The bars paint themselves: themes.css defines every preset's
                    tokens under [data-theme][data-mode], so this shows the REAL
                    palette of each theme and never a hardcoded hex. */}
                <span className={styles.swatchBars} data-theme={id} data-mode={mode}>
                  <i style={{ background: "var(--background)" }} />
                  <i style={{ background: "var(--foreground)" }} />
                  <i style={{ background: "var(--primary)" }} />
                </span>
                <span className={styles.swatchName}>
                  <span className={styles.radio} />
                  {THEME_LABELS[id] ?? id}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.field} style={{ marginTop: 20 }}>
            <label>Режим по умолчанию</label>
            <div className={styles.options} style={{ gap: 8 }}>
              {(["light", "dark"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`${styles.option} ${mode === value ? styles.optionSelected : ""}`}
                  style={{ padding: "10px 14px" }}
                  onClick={() => setMode(value)}
                  data-testid={`demo-mode-${value}`}
                >
                  <span className={styles.radio} />
                  <span className={styles.optionBody}>
                    <strong>{value === "light" ? "Светлый" : "Тёмный"}</strong>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setStep(2)}
            >
              Назад
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary} ${styles.grow}`}
              disabled={busy}
              onClick={create}
              data-testid="demo-create-shop"
            >
              {busy ? "Создаём магазин…" : "Создать магазин"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
