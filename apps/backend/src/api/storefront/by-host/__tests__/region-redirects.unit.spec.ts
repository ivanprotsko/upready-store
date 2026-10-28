import { readRegionRedirects } from "../region-redirects";

describe("readRegionRedirects", () => {
  it("answers nothing for a shop without the setting", () => {
    expect(readRegionRedirects(null)).toEqual([]);
    expect(readRegionRedirects(undefined)).toEqual([]);
    expect(readRegionRedirects({})).toEqual([]);
    expect(readRegionRedirects({ region_redirects: null })).toEqual([]);
    expect(readRegionRedirects({ region_redirects: ["ru"] })).toEqual([]);
  });

  it("reads cherkashino-com's Russia to the RU shop's home", () => {
    expect(readRegionRedirects({ region_redirects: { ru: "https://cherkashino.ru" } })).toEqual([
      { country: "ru", url: "https://cherkashino.ru/" },
    ]);
    expect(readRegionRedirects({ region_redirects: { RU: " https://cherkashino.ru/ru/store?x=1 " } })).toEqual([
      { country: "ru", url: "https://cherkashino.ru/" },
    ]);
  });

  it("drops a row that is not a country and an address", () => {
    expect(
      readRegionRedirects({
        region_redirects: {
          rus: "https://cherkashino.ru",
          kz: "cherkashino.kz",
          by: "javascript:alert(1)",
          am: 5,
          ru: "https://cherkashino.ru",
        },
      }),
    ).toEqual([{ country: "ru", url: "https://cherkashino.ru/" }]);
  });
});
