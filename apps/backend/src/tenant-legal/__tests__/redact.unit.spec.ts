import { redactLegalInline, redactLegalPlaceholders } from "../redact";
import { valuesFromRequisites, type RequisitesRow } from "../requisites";

/**
 * Unit facts of the PUBLIC rendering (b02-legal-and-redirects, piece 1): the
 * buyer never sees `{{ТОКЕН}}`; a blank requisite costs the SMALLEST block
 * carrying it, not the page; and a page whose requisites are filled comes out
 * exactly as written.
 *
 * The bodies below are the live shop's own, quoted from
 * `tenant_page.body` of tenant `cherkashino` (contacts, ru).
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

const FILLED_ROW: RequisitesRow = {
  ...EMPTY_ROW,
  legal_name: "Черкашина Оксана Сергеевна",
  inn: "301700000000",
  ogrn: "321300000000000",
  legal_address: "г. Астрахань, ул. Победы, 1",
  phone: "+7 911 718-01-23",
  phone_confirmed: true,
  email: "shop@example.ru",
};

const CONTACTS = `## Продавец

**Индивидуальный предприниматель {{ФИО_ИП}}**

| | |
|---|---|
| ОГРНИП | {{ОГРНИП}} |
| ИНН | {{ИНН}} |
| Адрес регистрации | {{ЮР_АДРЕС}} |
| Режим работы | 09:00–21:00 МСК, без выходных |

---

## Претензии

Направьте претензию одним из способов:

- **Электронная почта:** {{EMAIL}}
- **Telegram:** [t.me/cherkashina_oks](https://t.me/cherkashina_oks)

**Срок удовлетворения требований — 10 дней.**`;

describe("redactLegalPlaceholders", () => {
  const empty = () => redactLegalPlaceholders(CONTACTS, valuesFromRequisites(EMPTY_ROW, "shop.example"));

  it("leaves no placeholder in the body a visitor gets", () => {
    expect(empty().body).not.toContain("{{");
    expect(empty().body).not.toContain("ФИО_ИП");
  });

  it("hides the rows that carry a blank requisite and keeps the row that does not", () => {
    const { body } = empty();
    expect(body).not.toContain("ОГРНИП");
    expect(body).not.toContain("Адрес регистрации");
    expect(body).toContain("| Режим работы | 09:00–21:00 МСК, без выходных |");
    // The table's header survives with it.
    expect(body).toContain("|---|---|");
  });

  it("hides the list item with the blank e-mail and keeps its neighbour", () => {
    const { body } = empty();
    expect(body).not.toContain("Электронная почта");
    expect(body).toContain("**Telegram:** [t.me/cherkashina_oks](https://t.me/cherkashina_oks)");
  });

  it("hides the paragraph that is nothing but a placeholder, and the heading left with no section", () => {
    const { body } = empty();
    expect(body).not.toContain("Индивидуальный предприниматель");
    // «## Продавец» keeps its table, so the heading stays; «## Претензии» keeps its list.
    expect(body).toContain("## Продавец");
    expect(body).toContain("## Претензии");
    expect(body).toContain("Срок удовлетворения требований");
  });

  it("counts every hidden block for the panel", () => {
    // 3 table rows + 1 paragraph + 1 list item.
    expect(empty().hidden).toBe(5);
  });

  it("renders a filled document exactly as written, with the values in place", () => {
    const { body, hidden } = redactLegalPlaceholders(
      CONTACTS,
      valuesFromRequisites(FILLED_ROW, "shop.example"),
    );
    expect(hidden).toBe(0);
    expect(body).toContain("**Индивидуальный предприниматель Черкашина Оксана Сергеевна**");
    expect(body).toContain("| ОГРНИП | 321300000000000 |");
    expect(body).toContain("| ИНН | 301700000000 |");
    expect(body).toContain("**Электронная почта:** shop@example.ru");
    expect(body).not.toContain("{{");
  });

  it("drops a heading whose whole section went with the blank requisite", () => {
    const body = `## Реквизиты

| Поле | Значение |
|---|---|
| ИНН | {{ИНН}} |

## Доставка

Отгружаем за два дня.`;
    const result = redactLegalPlaceholders(body, valuesFromRequisites(EMPTY_ROW, "shop.example"));
    expect(result.body).not.toContain("## Реквизиты");
    expect(result.body).toContain("## Доставка");
    expect(result.body).toContain("Отгружаем за два дня.");
  });

  it("leaves a token it does not own exactly as the owner typed it", () => {
    const body = "Наш девиз — {{ДЕВИЗ_МАГАЗИНА}}.";
    const result = redactLegalPlaceholders(body, valuesFromRequisites(EMPTY_ROW, "shop.example"));
    expect(result.body).toBe("Наш девиз — {{ДЕВИЗ_МАГАЗИНА}}.");
    expect(result.hidden).toBe(0);
  });

  it("withholds the phone until it is confirmed, hiding its row rather than printing the digits", () => {
    const unconfirmed: RequisitesRow = { ...FILLED_ROW, phone_confirmed: false };
    const body = "| Телефон | {{ТЕЛЕФОН}} |\n| Email | {{EMAIL}} |";
    const result = redactLegalPlaceholders(body, valuesFromRequisites(unconfirmed, "shop.example"));
    expect(result.body).not.toContain("718-01-23");
    expect(result.body).toContain("| Email | shop@example.ru |");
    expect(result.hidden).toBe(1);
  });
});

describe("redactLegalInline", () => {
  const empty = (text: string) => redactLegalInline(text, valuesFromRequisites(EMPTY_ROW, "shop.example"));
  const filled = (text: string) => redactLegalInline(text, valuesFromRequisites(FILLED_ROW, "shop.example"));

  it("drops an unfilled token from a title and tidies the seam", () => {
    expect(empty("Публичная оферта {{ФИО_ИП}}")).toBe("Публичная оферта");
    expect(empty("Оферта — {{ФИО_ИП}}")).toBe("Оферта");
    expect(empty("{{ФИО_ИП}}: контакты")).toBe("контакты");
    expect(empty("Магазин {{ФИО_ИП}} — контакты")).toBe("Магазин — контакты");
  });

  it("substitutes a filled one, exactly as before", () => {
    expect(filled("Публичная оферта {{ФИО_ИП}}")).toBe("Публичная оферта Черкашина Оксана Сергеевна");
  });

  it("leaves a line with no tokens untouched, including a foreign one", () => {
    expect(empty("Контакты и реквизиты")).toBe("Контакты и реквизиты");
    expect(empty("Девиз: {{ДЕВИЗ_МАГАЗИНА}}")).toBe("Девиз: {{ДЕВИЗ_МАГАЗИНА}}");
  });
});
