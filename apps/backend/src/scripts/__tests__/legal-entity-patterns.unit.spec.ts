import {
  isEffectivelyEmpty,
  matches,
  matchesWithContext,
  stripInline,
  stripLines,
} from "../legal-entity-patterns";

describe("legal-entity-patterns", () => {
  it("matches ИП, ОГРНИП, ИНН with digits and the owner's surname, not a word that merely contains them", () => {
    expect(matches("Продавец: ИП Черкашина Оксана Ивановна")).toBe(true);
    expect(matches("ОГРНИП 312774600123456")).toBe(true);
    expect(matches("ИНН 770123456789")).toBe(true);
    expect(matches("курс ведёт Оксана Черкашина")).toBe(true);
    expect(matches("Автор: индивидуальный предприниматель Иванов")).toBe(true);
    // "ИП" as part of another word (e.g. "типичный") is not a standalone mention.
    expect(matches("Это типичный урок курса")).toBe(false);
    expect(matches("Очищение печени, занятие 3")).toBe(false);
    expect(matches(null)).toBe(false);
  });

  it("reports every match with context, trimmed and collapsed", () => {
    const text = "Длинный текст перед. Продавец: ИП Черкашина О.И., ИНН 770123456789. И ещё текст после.";
    const hits = matchesWithContext(text);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]).toContain("ИП Черкашина");
  });

  it("drops only the lines that carry a mention, keeping the rest byte for byte", () => {
    const body = "Урок 1\n\nАвтор: ИП Черкашина О.И., ИНН 770123456789\n\nСодержание урока.";
    const { text, removed } = stripLines(body);
    expect(text).toBe("Урок 1\n\n\nСодержание урока.");
    expect(removed).toBe(1);
  });

  it("removes just the matched phrase(s) from a short field and tidies the leftover whitespace", () => {
    // "ИП" and "Черкашина" are two separate matches, so both go, leaving the rest of the sentence intact.
    expect(stripInline("Производитель: ИП Черкашина Оксана")).toEqual({
      text: "Производитель: Оксана",
      removed: 1,
    })
    expect(stripInline("Очищение печени")).toEqual({ text: "Очищение печени", removed: 0 })
  })

  it("calls a page effectively empty once its remaining text is this short", () => {
    expect(isEffectivelyEmpty("   \n\n  ")).toBe(true);
    expect(isEffectivelyEmpty("Короткая строка")).toBe(true);
    expect(isEffectivelyEmpty("А".repeat(50))).toBe(false);
  });
});
