/**
 * What never reaches a model: a buyer's contacts, names and addresses, and
 * any secret a shop setting carries. The t27-02 rule: personal data is masked
 * before the model, not after.
 */

/** Keys dropped from any answer before it is read, with everything under them. */
const DROP_KEY =
  /^(email|phone|first_name|last_name|full_name|company|address(_\d)?|address_name|postal_code|city|province|country_code|customer|customer_id|customers|billing_address|shipping_address|addresses|metadata|ip|token|secret|password|api_key|key|login|merchant_login|credentials|settings|unreadable|result_url|sales_channel_id|created_by)$/i;
const DROP_PART = /(email|phone|password|secret|token|credential|api_key|first_name|last_name)/i;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+/gu;
/** Ten or more digits with the usual separators: a phone, not a price or an order number. */
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

export function maskText(text: string): string {
  return text.replace(EMAIL, "[email скрыт]").replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[телефон скрыт]" : m));
}

/** A deep copy with personal and secret fields removed and contacts masked inside the text. */
export function scrub(value: unknown): unknown {
  if (typeof value === "string") return maskText(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (DROP_KEY.test(key) || DROP_PART.test(key)) continue;
      out[key] = scrub(inner);
    }
    return out;
  }
  return value;
}

/** «меня зовут Анна Петрова», «моё имя Анна», «я — Анна»: the name after the words. */
const NAME = /((?:^|(?<=[\s,.!?]))(?:[Мм]еня зовут|[Мм]о[её] имя|[Mm]y name is|I am|[Яя]\s*[—–-]|[Яя](?=\s+[\p{Lu}])))\s+[\p{Lu}][\p{L}-]*(\s+[\p{Lu}][\p{L}-]*){0,2}/gu;
/** A street address: the street word and what follows up to the end of the clause; a six-digit postcode. */
const ADDRESS =
  /((?:г\.|город)\s*[\p{Lu}][\p{L}-]*[,\s]*)?(ул\.|улица|пр-т|просп\.?|проспект|пер\.|переулок|бульвар|б-р|шоссе|наб\.|набережная|мкр\.?|микрорайон)\s*(?:[^.;!?\n]|\.(?!\s+\p{Lu}))*/giu;
const POSTCODE = /(^|\D)\d{6}(?!\d)/g;

/**
 * A buyer's own words, with their contacts, name and address taken out
 * before a model reads them. The buyer assistant needs none of these: it
 * answers about the catalog, and an order question goes to the shop.
 */
export function maskBuyerText(text: string): string {
  return maskText(text)
    .replace(NAME, (_m, lead: string) => `${lead} [имя скрыто]`)
    .replace(ADDRESS, "[адрес скрыт]")
    .replace(POSTCODE, (_m, lead: string) => `${lead}[индекс скрыт]`);
}
