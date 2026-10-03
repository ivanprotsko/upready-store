import { EMPTY_APP_ICONS, EMPTY_BRANDING, mergeAppIcons, readBranding, type TenantAppIcons } from "../branding";

const SET: TenantAppIcons = {
  icon_svg_url: "https://cdn.example.com/icon.svg",
  favicon_ico_url: "https://cdn.example.com/favicon.ico",
  apple_touch_icon_url: "https://cdn.example.com/apple-touch-icon.png",
  icon_192_url: "https://cdn.example.com/icon-192.png",
  icon_512_url: "https://cdn.example.com/icon-512.png",
  icon_maskable_512_url: "https://cdn.example.com/icon-maskable-512.png",
  mstile_150_url: "https://cdn.example.com/mstile-150.png",
  mstile_310_url: "https://cdn.example.com/mstile-310.png",
  mask_icon_url: "https://cdn.example.com/mask-icon.svg",
  background_color: "#0a6a52",
};

const withSet = { ...EMPTY_BRANDING, favicon_url: "https://cdn.example.com/master.svg", app_icons: SET };

describe("readBranding app_icons", () => {
  it("is null for a tenant that never uploaded a set", () => {
    expect(readBranding({ branding: { favicon_url: "https://cdn.example.com/old.png" } }).app_icons).toBeNull();
  });

  it("reads a stored set and drops a malformed colour", () => {
    const stored = readBranding({ branding: { app_icons: { ...SET, background_color: "green" } } }).app_icons;

    expect(stored).toEqual({ ...SET, background_color: null });
  });
});

describe("mergeAppIcons", () => {
  it("keeps the current set when the body names neither the favicon nor the set", () => {
    expect(mergeAppIcons({}, withSet)).toEqual(SET);
  });

  it("keeps the set when the body repeats the same favicon", () => {
    expect(mergeAppIcons({ favicon_url: withSet.favicon_url }, withSet)).toEqual(SET);
  });

  it("drops the set when the favicon is cleared or replaced without a new set", () => {
    expect(mergeAppIcons({ favicon_url: null }, withSet)).toBeNull();
    expect(mergeAppIcons({ favicon_url: "https://cdn.example.com/other.png" }, withSet)).toBeNull();
  });

  it("takes the set the body names, filling missing fields with null", () => {
    expect(mergeAppIcons({ app_icons: { icon_192_url: SET.icon_192_url } }, withSet)).toEqual({
      ...EMPTY_APP_ICONS,
      icon_192_url: SET.icon_192_url,
    });
    expect(mergeAppIcons({ app_icons: null }, withSet)).toBeNull();
  });
});
