import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readConfig } from "./config.server"
import { fixtureAnswer, fixtureMedia } from "./fixture.server"
import { getLesson, requireSession } from "./store-api.server"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "school-fixture-"))
  const write = (rel: string, status: number, body: unknown) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), JSON.stringify({ status, body }))
  }
  write("store/tenant/courses/mine.json", 200, { courses: [] })
  write("store/tenant/courses/c1/lessons/l2.json", 403, { code: "lesson_locked", opens_at: "2026-10-18T00:00:00+03:00" })
  mkdirSync(path.join(dir, "media", "liver"), { recursive: true })
  writeFileSync(path.join(dir, "media", "liver", "v.mp4"), "0123456789")
  writeFileSync(path.join(dir, "secret.json"), "{}")
  vi.stubEnv("SCHOOL_FIXTURE", "1")
  vi.stubEnv("SCHOOL_FIXTURE_DIR", dir)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe("the fixture stand", () => {
  it("needs no variable of a real host and no cookie", () => {
    const session = requireSession(new Request("http://localhost:5190/app"))

    expect(readConfig({ SCHOOL_FIXTURE: "1" }).shopOrigin).toBe("https://cherkashino.ru")
    expect(session.token).toBe("fixture")
    expect(session.mediaOrigin).toBe("http://localhost:5190")
  })

  it("answers an API path from its file, with the file's status", async () => {
    expect(await fixtureAnswer("/store/tenant/courses/mine", "GET").json()).toEqual({ courses: [] })
    expect(fixtureAnswer("/store/tenant/courses/mine/none", "GET").status).toBe(404)
    expect(fixtureAnswer("/store/tenant/courses/c1/lessons/l2", "GET").status).toBe(403)
  })

  it("reads a locked lesson as locked, through the same client the pages use", async () => {
    const session = requireSession(new Request("http://localhost:5190/app/x/l2"))

    expect(await getLesson(session, "c1", "l2")).toEqual({ kind: "locked", opens_at: "2026-10-18T00:00:00+03:00" })
  })

  it("serves media by byte range, for a video that seeks", async () => {
    const whole = fixtureMedia("liver/v.mp4", new Request("http://localhost/fixture-media/liver/v.mp4"))
    const part = fixtureMedia("liver/v.mp4", new Request("http://localhost/x", { headers: { range: "bytes=2-5" } }))

    expect(whole.status).toBe(200)
    expect(whole.headers.get("content-type")).toBe("video/mp4")
    expect(part.status).toBe(206)
    expect(part.headers.get("content-range")).toBe("bytes 2-5/10")
    expect(await part.text()).toBe("2345")
  })

  it("serves nothing outside its media folder, and nothing at all off the stand", () => {
    expect(fixtureMedia("../secret.json", new Request("http://localhost/x")).status).toBe(404)
    expect(fixtureMedia("..%2Fsecret.json", new Request("http://localhost/x")).status).toBe(404)
    vi.stubEnv("SCHOOL_FIXTURE", "")
    expect(fixtureMedia("liver/v.mp4", new Request("http://localhost/x")).status).toBe(404)
  })
})
