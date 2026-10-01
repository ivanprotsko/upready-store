import { beforeEach, describe, expect, it, vi } from "vitest"
import { redirect } from "next/navigation"

/**
 * t-2026-10-01-checkout-ivan-3: `login`/`signup` used to leave the buyer on
 * `/account` no matter where they started the sign-in from. Both now redirect
 * to the `returnTo` the form carried in, sanitised through
 * `sanitizeAccountReturnPath` (`lib/util/return-path.test.ts` holds the
 * sanitising rule itself).
 */

const authLogin = vi.fn()
const authRegister = vi.fn()
const customerCreate = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    auth: {
      login: (...args: unknown[]) => authLogin(...args),
      register: (...args: unknown[]) => authRegister(...args),
    },
    store: {
      customer: {
        create: (...args: unknown[]) => customerCreate(...args),
      },
    },
  },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({ authorization: "Bearer token" }),
  getCacheOptions: async () => ({ tags: ["customers-cache_1"] }),
  getCacheTag: async () => "customers-cache_1",
  getCartId: async () => undefined,
  removeAuthToken: vi.fn(),
  removeCartId: vi.fn(),
  setAuthToken: vi.fn(),
}))

vi.mock("./orders", () => ({
  claimGuestOrders: vi.fn(async () => ({ claimed: 0, error: null })),
}))
vi.mock("./locale-actions", () => ({ getLocale: async () => "ru" }))

function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value)
  }
  return data
}

describe("login: where it sends the buyer once signed in", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear()
    authLogin.mockReset().mockResolvedValue("jwt-token")
  })

  it("redirects to the sanitized returnTo path on success", async () => {
    const { login } = await import("./customer")
    await login(
      null,
      formData({ email: "a@b.com", password: "secret", returnTo: "/ru/checkout" })
    )
    expect(redirect).toHaveBeenCalledWith("/ru/checkout")
  })

  it("falls back to the locale's account page when returnTo is absent", async () => {
    const { login } = await import("./customer")
    await login(null, formData({ email: "a@b.com", password: "secret" }))
    expect(redirect).toHaveBeenCalledWith("/ru/account")
  })

  it("falls back to the locale's account page when returnTo is hostile", async () => {
    const { login } = await import("./customer")
    await login(
      null,
      formData({
        email: "a@b.com",
        password: "secret",
        returnTo: "https://evil.com",
      })
    )
    expect(redirect).toHaveBeenCalledWith("/ru/account")
  })

  it("does not redirect when the credentials are rejected", async () => {
    authLogin.mockRejectedValue(new Error("Invalid credentials"))
    const { login } = await import("./customer")
    const result = await login(
      null,
      formData({ email: "a@b.com", password: "wrong", returnTo: "/ru/checkout" })
    )
    expect(result).toContain("Invalid credentials")
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe("signup: where it sends the buyer once the account exists", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear()
    authRegister.mockReset().mockResolvedValue("register-token")
    authLogin.mockReset().mockResolvedValue("jwt-token")
    customerCreate.mockReset().mockResolvedValue({ customer: { id: "cus_1" } })
  })

  const signupFields = (returnTo?: string) => ({
    email: "new@b.com",
    password: "password123",
    first_name: "A",
    last_name: "B",
    phone: "",
    ...(returnTo ? { returnTo } : {}),
  })

  it("redirects to the sanitized returnTo path on success", async () => {
    const { signup } = await import("./customer")
    await signup(null, formData(signupFields("/ru/checkout")))
    expect(redirect).toHaveBeenCalledWith("/ru/checkout")
  })

  it("falls back to the locale's account page when returnTo is absent", async () => {
    const { signup } = await import("./customer")
    await signup(null, formData(signupFields()))
    expect(redirect).toHaveBeenCalledWith("/ru/account")
  })

  it("falls back to the locale's account page when returnTo is hostile", async () => {
    const { signup } = await import("./customer")
    await signup(null, formData(signupFields("/\\evil.com")))
    expect(redirect).toHaveBeenCalledWith("/ru/account")
  })

  it("does not redirect when registration fails", async () => {
    authRegister.mockRejectedValue(new Error("Email already exists"))
    const { signup } = await import("./customer")
    const result = await signup(null, formData(signupFields("/ru/checkout")))
    expect(result).toContain("Email already exists")
    expect(redirect).not.toHaveBeenCalled()
  })

  it("does not redirect when the password is too short", async () => {
    const { signup } = await import("./customer")
    const result = await signup(
      null,
      formData({ ...signupFields("/ru/checkout"), password: "short" })
    )
    expect(result).toBe("passwordTooShort")
    expect(redirect).not.toHaveBeenCalled()
  })
})
