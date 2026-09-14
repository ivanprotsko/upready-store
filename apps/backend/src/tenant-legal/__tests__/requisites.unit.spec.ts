import {
  DOMAIN_TOKEN,
  LEGAL_TOKENS,
  missingLegalTokens,
  resolveLegalPlaceholders,
  tokensInText,
  valuesFromRequisites,
  type RequisitesRow,
} from "../requisites";

/**
 * Unit facts of the seller-requisites resolver (t12-legal-requisites): an
 * unfilled token renders literally, a fully filled document renders no
 * braces, one tenant's requisites never leak into another's render, and an
 * unconfirmed phone stays withheld. Step plan piece 5.
 */

const EMPTY_ROW: RequisitesRow = {
  legal_name: null,
  inn: null,
  ogrn: null,
  legal_address: null,
  return_address: null,
  phone: null,
  phone_confirmed: false,
  email: null,
  dpo_email: null,
  delivery_methods: null,
  effective_date: null,
  revision_date: null,
  document_date: null,
  rkn_notice_date: null,
  rkn_reg_number: null,
  newsletter_management_url: null,
  bank_details: null,
};

const FULL_ROW: RequisitesRow = {
  legal_name: "ИП Черкашина Оксана Ивановна",
  inn: "524900658999",
  ogrn: "309524933000032",
  legal_address: "г. Элиста, ул. Ленина, 1",
  return_address: "СДЭК, Элиста, Ленина 1",
  phone: "+7 (911) 718-01-23",
  phone_confirmed: true,
  email: "shop@cherkashino.example",
  dpo_email: "dpo@cherkashino.example",
  delivery_methods: "СДЭК, Почта России",
  effective_date: "01.09.2026",
  revision_date: "01.09.2026",
  document_date: "01.09.2026",
  rkn_notice_date: "01.09.2026",
  rkn_reg_number: "77-12-345678",
  newsletter_management_url: "https://cherkashino.upready.dev/unsubscribe",
  bank_details: "Ozon Банк",
};

const BODY_WITH_ALL_TOKENS = LEGAL_TOKENS.map((token) => `{{${token}}}`).join(" ");

describe("tenant-legal/requisites: resolveLegalPlaceholders", () => {
  it("renders no braces when every one of the 16 tokens has a value", () => {
    const values = valuesFromRequisites(FULL_ROW, "cherkashino.upready.dev");
    const rendered = resolveLegalPlaceholders(BODY_WITH_ALL_TOKENS, values);
    expect(rendered).not.toMatch(/\{\{/);
  });

  it("renders exactly one literal token when one field is missing, and nothing else changes", () => {
    const full = valuesFromRequisites(FULL_ROW, "cherkashino.upready.dev");
    const oneMissing = { ...full, ИНН: null };
    const rendered = resolveLegalPlaceholders(BODY_WITH_ALL_TOKENS, oneMissing);

    expect(rendered).toContain("{{ИНН}}");
    expect((rendered.match(/\{\{/g) ?? []).length).toBe(1);

    // Every other token resolved to its FULL_ROW value, unchanged.
    const withoutInn = rendered.replace("{{ИНН}} ", "").replace(" {{ИНН}}", "");
    expect(withoutInn).not.toMatch(/\{\{/);
  });

  it("leaves every token literal on a fully empty document", () => {
    const values = valuesFromRequisites(EMPTY_ROW, null);
    const rendered = resolveLegalPlaceholders(BODY_WITH_ALL_TOKENS, values);
    for (const token of LEGAL_TOKENS) {
      expect(rendered).toContain(`{{${token}}}`);
    }
  });

  it("touches only the tokens it knows, leaving an unrelated {{…}} alone", () => {
    const values = valuesFromRequisites(FULL_ROW, "cherkashino.upready.dev");
    const rendered = resolveLegalPlaceholders("see {{НЕИЗВЕСТНЫЙ_ТОКЕН}} and {{ИНН}}", values);
    expect(rendered).toContain("{{НЕИЗВЕСТНЫЙ_ТОКЕН}}");
    expect(rendered).toContain(FULL_ROW.inn as string);
  });

  it(`resolves ${DOMAIN_TOKEN} from the value handed in, not from a stored field`, () => {
    const values = valuesFromRequisites(EMPTY_ROW, "acme.upready.dev");
    const rendered = resolveLegalPlaceholders(`{{${DOMAIN_TOKEN}}}`, values);
    expect(rendered).toBe("acme.upready.dev");
  });
});

describe("tenant-legal/requisites: one tenant's row never leaks into another's render", () => {
  it("a page resolved with tenant A's row never contains tenant B's values", () => {
    const tenantA: RequisitesRow = { ...EMPTY_ROW, inn: "111111111111", legal_name: "ИП Первый" };
    const tenantB: RequisitesRow = { ...EMPTY_ROW, inn: "222222222222", legal_name: "ИП Второй" };

    const bodyA = resolveLegalPlaceholders(
      "{{ФИО_ИП}}, ИНН {{ИНН}}",
      valuesFromRequisites(tenantA, "a.upready.dev"),
    );
    const bodyB = resolveLegalPlaceholders(
      "{{ФИО_ИП}}, ИНН {{ИНН}}",
      valuesFromRequisites(tenantB, "b.upready.dev"),
    );

    expect(bodyA).toContain("111111111111");
    expect(bodyA).not.toContain("222222222222");
    expect(bodyB).toContain("222222222222");
    expect(bodyB).not.toContain("111111111111");
  });
});

describe("tenant-legal/requisites: phone confirmation", () => {
  it("withholds {{ТЕЛЕФОН}} while phone_confirmed is false, even with a number on file", () => {
    const row: RequisitesRow = { ...EMPTY_ROW, phone: "+7 (911) 718-01-23", phone_confirmed: false };
    const values = valuesFromRequisites(row, null);
    expect(values.ТЕЛЕФОН).toBeNull();
    expect(resolveLegalPlaceholders("{{ТЕЛЕФОН}}", values)).toBe("{{ТЕЛЕФОН}}");
    expect(missingLegalTokens(row, null)).toContain("ТЕЛЕФОН");
  });

  it("fills {{ТЕЛЕФОН}} once phone_confirmed is true", () => {
    const row: RequisitesRow = { ...EMPTY_ROW, phone: "+7 (911) 718-01-23", phone_confirmed: true };
    const values = valuesFromRequisites(row, null);
    expect(values.ТЕЛЕФОН).toBe("+7 (911) 718-01-23");
    expect(missingLegalTokens(row, null)).not.toContain("ТЕЛЕФОН");
  });
});

describe("tenant-legal/requisites: missingLegalTokens / tokensInText", () => {
  it("lists all 16 tokens missing on an empty row with no domain", () => {
    expect(missingLegalTokens(EMPTY_ROW, null).sort()).toEqual([...LEGAL_TOKENS].sort());
  });

  it("lists nothing missing on a full row with a resolved domain", () => {
    expect(missingLegalTokens(FULL_ROW, "cherkashino.upready.dev")).toEqual([]);
  });

  it("finds every known token literally present in a body, once each", () => {
    const found = tokensInText("{{ИНН}} и снова {{ИНН}}, а ещё {{EMAIL}}");
    expect(found.sort()).toEqual(["EMAIL", "ИНН"].sort());
  });
});
