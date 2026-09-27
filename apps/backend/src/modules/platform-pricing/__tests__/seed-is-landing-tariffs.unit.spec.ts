import { PricingDocumentSchema } from "../schema";
import { LANDING_3TIER_PRICING as seed } from "../seed/landing-3tier";
import { OKSANA_3TIER_PRICING } from "../seed/oksana-3tier";

/**
 * t-2026-09-27-05, order o-20260921-01 answer 7a: the platform's pricing
 * document is the landing's own three tariffs
 * (`apps/homepage/port/src/sections/tariffs/data.ts` `PLANS`, read from
 * `origin/dev` on 2026-09-27). This suite pins the values transcribed from
 * that file, so a change to either drifts loudly instead of silently.
 */

const TELEGRAM_HINT =
  "Витрина открывается прямо в Telegram: каталог, корзина и оплата внутри мессенджера — покупателю не нужно ставить отдельное приложение.";
const CATALOG_HINT = "Столько карточек товара можно держать в каталоге витрины одновременно.";

describe("platform pricing seed = the landing's three tariffs", () => {
  it("is a valid document", () => {
    expect(() => PricingDocumentSchema.parse(seed)).not.toThrow();
  });

  it("has exactly the three tariffs, in the landing's order", () => {
    expect(seed.tiers.map((t) => t.id)).toEqual(["novice", "pro", "master"]);
    expect(seed.tiers.map((t) => t.name)).toEqual(["Новичок", "Профи", "Мастер"]);
  });

  it("prices novice free forever, with no yearly price", () => {
    const novice = seed.tiers[0];
    expect(novice.price).toBe("Бесплатно");
    expect(novice.price_note).toBe("навсегда");
    expect(novice.price_annual).toBeNull();
    expect(novice.trial_days).toBeNull();
  });

  it("prices pro at 699 ₽/mo, 458 ₽/mo yearly, a 3-day trial", () => {
    const pro = seed.tiers[1];
    expect(pro.price).toBe("699 ₽");
    expect(pro.price_note).toBe("в месяц");
    expect(pro.price_annual).toEqual({ amount: "458 ₽", period: "в месяц", note: "при оплате за год" });
    expect(pro.trial_days).toBe(3);
  });

  it("prices master at 4 499 ₽/mo both periods, a 7-day trial", () => {
    const master = seed.tiers[2];
    expect(master.price).toBe("4 499 ₽");
    expect(master.price_note).toBe("в месяц");
    expect(master.price_annual).toEqual({ amount: "4 499 ₽", period: "в месяц", note: "при оплате за год" });
    expect(master.trial_days).toBe(7);
  });

  it("carries the landing's five features per tier, in order, with their hints", () => {
    expect(seed.tiers[0].features.map((f) => f.text)).toEqual([
      "15 товаров",
      "выбор из шаблонов",
      "стандартная поддержка",
      "один язык витрины",
      "Telegram Mini App",
    ]);
    expect(seed.tiers[0].features[0].tip).toBe(CATALOG_HINT);
    expect(seed.tiers[0].features[4].tip).toBe(TELEGRAM_HINT);
    expect(seed.tiers[0].features[4].note).toBe("1");

    expect(seed.tiers[2].features.map((f) => f.text)).toEqual([
      "Неограниченное количество товаров",
      "брендированный дизайн",
      "персональный менеджер",
      "любое количество языков витрины",
      "Telegram Mini App включён",
    ]);
    expect(seed.tiers[2].features[0].note).toBe("4");
  });

  it("routes novice free, pro/master into a no-card trial straight into the wizard", () => {
    expect(seed.tiers[0].button.action).toEqual({ type: "onboarding_free" });
    expect(seed.tiers[1].button.action).toEqual({ type: "onboarding_trial", trial_days: 3 });
    expect(seed.tiers[2].button.action).toEqual({ type: "onboarding_trial", trial_days: 7 });
  });

  it("keeps the comparison table's rows, remapped Старт→Новичок, Рост→Профи, Масштаб→Мастер, dropping Глобализация", () => {
    expect(seed.sections).toHaveLength(OKSANA_3TIER_PRICING.sections.length);

    seed.sections.forEach((section, s) => {
      const oldSection = OKSANA_3TIER_PRICING.sections[s];
      expect(section.rows.map((r) => r.feature)).toEqual(oldSection.rows.map((r) => r.feature));

      section.rows.forEach((row, r) => {
        const oldValues = oldSection.rows[r].values;
        expect(Object.keys(row.values).sort()).toEqual(["master", "novice", "pro"]);
        expect(row.values.novice).toEqual(oldValues.start);
        expect(row.values.pro).toEqual(oldValues.growth);
        expect(row.values.master).toEqual(oldValues.scale);
      });
    });
  });

  it("points the final block's button at novice", () => {
    expect(seed.final.tier_id).toBe("novice");
  });
});
