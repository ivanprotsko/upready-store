import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

/**
 * t-2026-10-13-29 stage 2, the store side of the GetCourse courses: the
 * contents in sections with locks by day, the lesson's videos and files
 * through the media route, 403 `lesson_locked` for a lesson of a later day,
 * and the media route itself, which redirects only for a key a lesson of the
 * same course names.
 *
 * The buyer's access started at 10:00 Moscow time on 19 October; the clock
 * reads 12:00 Moscow time on 21 October, day 3 of the program.
 */

jest.mock("../../resolve-tenant", () => ({
  resolveTenantFromPublishableKey: jest.fn().mockResolvedValue({
    id: "ten_ru",
    handle: "cherkashino-ru",
    name: "Черкашино",
    sales_channel_id: "sc_ru",
  }),
}));

import { GET as getMyCourse } from "../mine/[slug]/route";
import { GET as getLesson } from "../[id]/lessons/[lessonId]/route";
import { POST as markViewed } from "../[id]/lessons/[lessonId]/viewed/route";
import { GET as getMedia } from "../[id]/media/route";

const NOW = new Date("2026-10-21T09:00:00.000Z");

const COURSE = {
  id: "crs_lymph",
  tenant_id: "ten_ru",
  product_id: "prod_lymph",
  title: "Очищение лимфы",
  slug: "ochishchenie-limfy",
  description: null,
  status: "published",
  telegram_channel_url: "https://t.me/+channel",
  telegram_chat_url: null,
  start_date: null,
  access_days: 90,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};

const VIDEO_KEY = "courses/ten_ru/ochishchenie-limfy/videos/259341481-01K.mp4";
const FILE_KEY = "courses/ten_ru/ochishchenie-limfy/files/raspisanie-01K.pdf";
const LATE_KEY = "courses/ten_ru/ochishchenie-limfy/videos/lavazh-01K.mp4";

const lesson = (id: string, order: number, extra: Record<string, unknown> = {}) => ({
  id,
  tenant_id: "ten_ru",
  course_id: COURSE.id,
  title: `Урок ${order}`,
  order,
  body: "Текст",
  video_url: null,
  quiz: null,
  section: null,
  section_order: null,
  cover_url: null,
  summary: null,
  videos: null,
  attachments: null,
  links: null,
  available_from_day: null,
  metadata: null,
  ...extra,
});

const LESSONS = [
  lesson("lsn_1", 1, {
    section: "Подготовка",
    section_order: 1,
    cover_url: "https://cdn.example/cover-1.jpg",
    summary: "Режим дня",
    video_url: "https://s3.example/bucket/raw-1.mp4",
    videos: [
      { url: "https://s3.example/bucket/raw-1.mp4", key: VIDEO_KEY, duration_sec: 74 },
      { url: "https://kinescope.example/v/2", title: "Эфир" },
    ],
    attachments: [{ name: "Расписание.pdf", url: "https://s3.example/bucket/raw.pdf", key: FILE_KEY, size_bytes: 1024 }],
    links: [{ kind: "youtube", url: "https://www.youtube.com/watch?v=i_UTD2Mh4mI", title: "Видео на YouTube" }],
  }),
  lesson("lsn_2", 2, { section: "Подготовка", section_order: 1 }),
  lesson("lsn_3", 3, {
    section: "Основная программа",
    section_order: 3,
    available_from_day: 6,
    videos: [{ url: "https://s3.example/bucket/raw-3.mp4", key: LATE_KEY }],
  }),
  lesson("lsn_4", 4, { section: "Основная программа", section_order: 3, available_from_day: 3 }),
];

const fakeCourseService = (entitled = true) => ({
  listCourses: jest.fn(async () => [COURSE]),
  listLessons: jest.fn(async (filters: { id?: string }) =>
    filters.id ? LESSONS.filter((row) => row.id === filters.id) : LESSONS,
  ),
  listCourseEntitlements: jest.fn(async () =>
    entitled ? [{ id: "cent_1", status: "active", granted_at: "2026-10-19T07:00:00.000Z" }] : [],
  ),
  listCourseProgresses: jest.fn(async () => [
    { id: "cprg_1", lesson_id: "lsn_1", viewed_at: "2026-10-19T08:00:00.000Z" },
    { id: "cprg_2", lesson_id: "lsn_2", viewed_at: "2026-10-20T08:00:00.000Z" },
  ]),
  createCourseProgresses: jest.fn(),
});

const fakeFileService = () => ({
  retrieveFile: jest.fn(async (key: string) => ({ id: key, url: `https://s3.example/bucket/${key}?X-Amz-Signature=abc` })),
});

const fakeReq = (
  params: Record<string, string>,
  query: Record<string, unknown> = {},
  services = { course: fakeCourseService(), file: fakeFileService() },
) => {
  const req = {
    locale: undefined,
    params: { slug: COURSE.slug, id: COURSE.id, ...params },
    query,
    auth_context: { actor_id: "cus_1" },
    scope: {
      resolve: (key: string) => {
        if (key === "course") return services.course;
        if (key === Modules.FILE) return services.file;
        throw new Error(`unexpected resolve(${key})`);
      },
    },
  };
  return { req: req as unknown as MedusaStoreRequest, services };
};

const fakeRes = () => {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    redirected: null as null | { status: number; url: string },
    status: jest.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(),
    setHeader: jest.fn(function (this: { headers: Record<string, string> }, name: string, value: string) {
      this.headers[name] = value;
    }),
    redirect: jest.fn(function (this: { redirected: unknown }, status: number, url: string) {
      this.redirected = { status, url };
    }),
  };
  return res as unknown as MedusaResponse & typeof res;
};

beforeAll(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] });
});

afterAll(() => {
  jest.useRealTimers();
});

type ContentsLesson = { id: string; locked: boolean; opens_at: string | null; cover_url: string | null; summary: string | null };
type Contents = {
  course: { telegram_channel_url: string | null; telegram_chat_url: string | null; access_until: string | null };
  lessons: ContentsLesson[];
  sections: { title: string | null; order: number; lessons: ContentsLesson[] }[];
  continue_lesson_id: string | null;
};

describe("GET /store/tenant/courses/mine/:slug", () => {
  const contents = async () => {
    const { req } = fakeReq({});
    const res = fakeRes();
    await getMyCourse(req as never, res);
    return res.json.mock.calls[0][0] as Contents;
  };

  it("folds the lessons into the course's sections next to the flat list", async () => {
    const body = await contents();

    expect(body.lessons.map((row) => row.id)).toEqual(["lsn_1", "lsn_2", "lsn_3", "lsn_4"]);
    expect(body.sections.map((group) => [group.title, group.order, group.lessons.map((row) => row.id)])).toEqual([
      ["Подготовка", 1, ["lsn_1", "lsn_2"]],
      ["Основная программа", 3, ["lsn_3", "lsn_4"]],
    ]);
  });

  it("locks the day 6 lesson until Moscow midnight of 24 October and opens the day 3 one", async () => {
    const body = await contents();
    const byId = new Map(body.lessons.map((row) => [row.id, row]));

    expect(byId.get("lsn_3")).toMatchObject({ locked: true, opens_at: "2026-10-23T21:00:00.000Z" });
    expect(byId.get("lsn_4")).toMatchObject({ locked: false, opens_at: "2026-10-20T21:00:00.000Z" });
    expect(byId.get("lsn_1")).toMatchObject({
      locked: false,
      opens_at: null,
      cover_url: "https://cdn.example/cover-1.jpg",
      summary: "Режим дня",
    });
  });

  it("points «Продолжить» past the closed lesson, at the first open one not viewed", async () => {
    expect((await contents()).continue_lesson_id).toBe("lsn_4");
  });

  it("carries the course's Telegram links and the end of access", async () => {
    const body = await contents();

    expect(body.course).toMatchObject({
      telegram_channel_url: "https://t.me/+channel",
      telegram_chat_url: null,
      // 90 days from 19 October, day 1 included.
      access_until: "2027-01-16T21:00:00.000Z",
    });
  });
});

describe("GET /store/tenant/courses/:id/lessons/:lessonId", () => {
  it("serves stored videos and files through the media route, never their own address", async () => {
    const { req } = fakeReq({ lessonId: "lsn_1" });
    const res = fakeRes();
    await getLesson(req as never, res);
    const { lesson: body } = res.json.mock.calls[0][0] as {
      lesson: { video_url: string; videos: { url: string }[]; attachments: { url: string; name: string }[]; links: unknown[] };
    };

    const videoRoute = `/store/tenant/courses/crs_lymph/media?key=${encodeURIComponent(VIDEO_KEY)}`;
    expect(body.videos).toEqual([
      { url: videoRoute, title: null, duration_sec: 74, poster_url: null },
      { url: "https://kinescope.example/v/2", title: "Эфир", duration_sec: null, poster_url: null },
    ]);
    expect(body.video_url).toBe(videoRoute);
    expect(body.attachments).toEqual([
      {
        name: "Расписание.pdf",
        url: `/store/tenant/courses/crs_lymph/media?key=${encodeURIComponent(FILE_KEY)}`,
        size_bytes: 1024,
        mime: null,
      },
    ]);
    expect(body.links).toEqual([
      { kind: "youtube", url: "https://www.youtube.com/watch?v=i_UTD2Mh4mI", title: "Видео на YouTube" },
    ]);
    expect(JSON.stringify(body)).not.toContain("s3.example");
  });

  it("answers 403 lesson_locked with the opening instant and no content for a later day's lesson", async () => {
    const { req } = fakeReq({ lessonId: "lsn_3" });
    const res = fakeRes();
    await getLesson(req as never, res);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "lesson_locked", opens_at: "2026-10-23T21:00:00.000Z" }),
    );
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("lavazh");
  });

  it("refuses to mark a later day's lesson viewed", async () => {
    const { req, services } = fakeReq({ lessonId: "lsn_3" });
    const res = fakeRes();
    await markViewed(req as never, res);

    expect(res.statusCode).toBe(403);
    expect(services.course.createCourseProgresses).not.toHaveBeenCalled();
  });
});

describe("GET /store/tenant/courses/:id/media", () => {
  const media = async (key: unknown, services = { course: fakeCourseService(), file: fakeFileService() }) => {
    const { req } = fakeReq({}, { key }, services);
    const res = fakeRes();
    await getMedia(req as never, res);
    return { res, services };
  };

  it("redirects 302 to the file module's signed address for a key of an open lesson", async () => {
    const { res, services } = await media(VIDEO_KEY);

    expect(services.file.retrieveFile).toHaveBeenCalledWith(VIDEO_KEY);
    expect(res.redirected).toEqual({
      status: 302,
      url: `https://s3.example/bucket/${VIDEO_KEY}?X-Amz-Signature=abc`,
    });
    expect(res.headers["Cache-Control"]).toBe("private, no-store");
  });

  it("serves a lesson's file the same way", async () => {
    const { res } = await media(FILE_KEY);

    expect(res.redirected?.status).toBe(302);
  });

  it("is a 404 for a key no lesson of this course names, without asking the file module", async () => {
    const services = { course: fakeCourseService(), file: fakeFileService() };

    await expect(media("courses/ten_ru/ochishchenie-pecheni/videos/other-course.mp4", services)).rejects.toMatchObject({
      type: "not_found",
    });
    expect(services.file.retrieveFile).not.toHaveBeenCalled();
  });

  it("is a 403 lesson_locked for a key only a later day's lesson names", async () => {
    const services = { course: fakeCourseService(), file: fakeFileService() };
    const { res } = await media(LATE_KEY, services);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "lesson_locked", opens_at: "2026-10-23T21:00:00.000Z" }),
    );
    expect(services.file.retrieveFile).not.toHaveBeenCalled();
  });

  it("is a 403 for a customer who has not bought the course", async () => {
    const services = { course: fakeCourseService(false), file: fakeFileService() };

    await expect(media(VIDEO_KEY, services)).rejects.toMatchObject({ type: "forbidden" });
    expect(services.file.retrieveFile).not.toHaveBeenCalled();
  });

  it("is a 400 without a key", async () => {
    await expect(media(undefined)).rejects.toMatchObject({ type: "invalid_data" });
  });
});
