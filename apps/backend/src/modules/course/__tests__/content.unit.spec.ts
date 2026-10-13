import { PostTenantLessonSchema, PutTenantCourseSchema } from "../../../api/tenants/courses/validators";
import { lessonContentForWrite, toLessonDto, videoUrlForWrite } from "../../../api/tenants/courses/course-helpers";
import { courseMediaPath, lessonFileKeys, parseLessonVideos, toStoreAttachments, toStoreVideos } from "../content";

/**
 * t-2026-10-13-29 stage 2: the lesson's videos, files and links as stored,
 * as the owner's panel writes them, and as a buyer gets them.
 */

const KEY = "courses/ten_ru/ochishchenie-pecheni/videos/265221338-01K.mp4";

describe("toStoreVideos and toStoreAttachments", () => {
  it("turn a stored file into the media route and pass an address the owner pasted through", () => {
    const videos = toStoreVideos("crs_1", [
      { url: "https://s3.example/b/raw.mp4", key: KEY, duration_sec: 247 },
      { url: "https://kinescope.example/v/1", title: "Эфир" },
    ]);

    expect(videos).toEqual([
      { url: courseMediaPath("crs_1", KEY), title: null, duration_sec: 247, poster_url: null },
      { url: "https://kinescope.example/v/1", title: "Эфир", duration_sec: null, poster_url: null },
    ]);
    expect(courseMediaPath("crs_1", KEY)).toBe(
      "/store/tenant/courses/crs_1/media?key=courses%2Ften_ru%2Fochishchenie-pecheni%2Fvideos%2F265221338-01K.mp4",
    );
  });

  it("send a file's name and size, not its stored address", () => {
    const [file] = toStoreAttachments("crs_1", [
      { name: "Меню.pdf", url: "https://s3.example/b/menu.pdf", key: "k/menu.pdf", size_bytes: 10, mime: "application/pdf" },
    ]);

    expect(file).toEqual({ name: "Меню.pdf", url: courseMediaPath("crs_1", "k/menu.pdf"), size_bytes: 10, mime: "application/pdf" });
  });
});

describe("parseLessonVideos", () => {
  it("reads null and a non-list as no videos and drops one broken entry, keeping the rest", () => {
    expect(parseLessonVideos(null)).toEqual([]);
    expect(parseLessonVideos({ url: "https://x.example/a.mp4" })).toEqual([]);
    expect(parseLessonVideos([{ url: "not a url" }, { url: "https://x.example/a.mp4" }])).toEqual([
      { url: "https://x.example/a.mp4" },
    ]);
  });
});

describe("lessonFileKeys", () => {
  it("collects the keys of the lesson's videos and files only", () => {
    const keys = lessonFileKeys({
      videos: [{ url: "https://x.example/a.mp4", key: "a" }, { url: "https://x.example/b.mp4" }],
      attachments: [{ name: "c.pdf", url: "https://x.example/c.pdf", key: "c" }],
    });

    expect([...keys]).toEqual(["a", "c"]);
  });
});

describe("the owner's lesson writes", () => {
  it("accept the stage 2 fields and refuse an unknown link kind", () => {
    const body = {
      title: "Урок",
      section: "Подготовка",
      section_order: 1,
      summary: "Как лежать на грелке",
      videos: [{ url: "https://x.example/a.mp4", key: KEY, duration_sec: 10 }],
      attachments: [{ name: "a.pdf", url: "https://x.example/a.pdf", size_bytes: 1 }],
      links: [{ kind: "telegram_chat", url: "https://t.me/+chat", title: "Чат" }],
      available_from_day: 6,
    };

    expect(PostTenantLessonSchema.safeParse(body).success).toBe(true);
    expect(
      PostTenantLessonSchema.safeParse({ ...body, links: [{ kind: "vk", url: "https://vk.com/x", title: "VK" }] }).success,
    ).toBe(false);
  });

  it("set video_url from the first video unless it is sent itself", () => {
    expect(videoUrlForWrite({ videos: [{ url: "https://x.example/a.mp4" }, { url: "https://x.example/b.mp4" }] })).toEqual({
      video_url: "https://x.example/a.mp4",
    });
    expect(videoUrlForWrite({ videos: [] })).toEqual({ video_url: null });
    expect(videoUrlForWrite({ videos: [{ url: "https://x.example/a.mp4" }], video_url: "https://y.example/v" })).toEqual({
      video_url: "https://y.example/v",
    });
    expect(videoUrlForWrite({})).toEqual({});
  });

  it("write only the fields the body sent, null included", () => {
    expect(lessonContentForWrite({ section: null, available_from_day: 3 })).toEqual({ section: null, available_from_day: 3 });
  });

  it("read back with videos as stored, key included, for the owner", () => {
    const dto = toLessonDto({
      id: "lsn_1",
      tenant_id: "ten_ru",
      course_id: "crs_1",
      title: "Урок",
      order: 1,
      body: "",
      video_url: null,
      videos: [{ url: "https://x.example/a.mp4", key: KEY }],
    });

    expect(dto.videos).toEqual([{ url: "https://x.example/a.mp4", key: KEY }]);
    expect(dto).toMatchObject({ section: null, attachments: [], links: [], available_from_day: null });
  });
});

describe("the owner's course writes", () => {
  it("accept the Telegram links, the stream start and the access length", () => {
    const parsed = PutTenantCourseSchema.parse({
      telegram_channel_url: "https://t.me/+channel",
      telegram_chat_url: null,
      start_date: "2026-10-19",
      access_days: 90,
    });

    expect(parsed.start_date).toBeInstanceOf(Date);
    expect(PutTenantCourseSchema.safeParse({ access_days: 0 }).success).toBe(false);
  });
});
