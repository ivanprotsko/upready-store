/**
 * The bank and crypto icons a shop owner picks from for a payment requisite
 * (t-cherk-com-hotfix batch 6, Ivan 03.10: «забей туда сразу иконки банков
 * Казахстана и прочих, но не русских банков»). The ONE list: the panel reads it
 * from `GET /tenants/payment-settings/manual` (`presets`), the write side
 * accepts only these keys, and both the storefront and the panel draw the
 * icon from `/payment-icons/<key>.png` in their own `public/`.
 *
 * No Russian bank belongs here.
 */
export type PaymentIconPreset = {
  key: string;
  name: string;
  /** ISO 3166-1 alpha-2, or null for a crypto asset. */
  country: string | null;
  kind: "bank" | "crypto";
};

export const PAYMENT_ICON_PRESETS: PaymentIconPreset[] = [
  { key: "kaspi", name: "Kaspi Bank", country: "KZ", kind: "bank" },
  { key: "halyk", name: "Halyk Bank", country: "KZ", kind: "bank" },
  { key: "freedom", name: "Freedom Bank", country: "KZ", kind: "bank" },
  { key: "jusan", name: "Jusan Bank", country: "KZ", kind: "bank" },
  { key: "forte", name: "ForteBank", country: "KZ", kind: "bank" },
  { key: "bcc", name: "Bank CenterCredit", country: "KZ", kind: "bank" },
  { key: "homecredit", name: "Home Credit Bank", country: "KZ", kind: "bank" },
  { key: "eurasian", name: "Eurasian Bank", country: "KZ", kind: "bank" },
  { key: "bereke", name: "Bereke Bank", country: "KZ", kind: "bank" },
  { key: "rbk", name: "Bank RBK", country: "KZ", kind: "bank" },
  { key: "wise", name: "Wise", country: "GB", kind: "bank" },
  { key: "revolut", name: "Revolut", country: "GB", kind: "bank" },
  { key: "tbc", name: "TBC Bank", country: "GE", kind: "bank" },
  { key: "bog", name: "Bank of Georgia", country: "GE", kind: "bank" },
  { key: "optima", name: "Optima Bank", country: "KG", kind: "bank" },
  { key: "mbank", name: "MBank", country: "KG", kind: "bank" },
  { key: "ameria", name: "Ameriabank", country: "AM", kind: "bank" },
  { key: "kapitalbank", name: "Kapitalbank", country: "UZ", kind: "bank" },
  { key: "usdt", name: "Tether USDT", country: null, kind: "crypto" },
  { key: "usdc", name: "USD Coin", country: null, kind: "crypto" },
];

export const BANK_ICON_KEYS: string[] = PAYMENT_ICON_PRESETS.filter((preset) => preset.kind === "bank").map(
  (preset) => preset.key,
);

/**
 * What an owner may have typed for a bank before the icons existed, so a card
 * stored in the old shape gets its icon on the first read. Lower case, matched
 * as a substring of the bank name.
 */
const BANK_ALIASES: Record<string, string[]> = {
  kaspi: ["kaspi", "каспи"],
  halyk: ["halyk", "халык"],
  freedom: ["freedom", "фридом"],
  jusan: ["jusan", "жусан"],
  forte: ["forte", "форте"],
  bcc: ["centercredit", "center credit", "центркредит", "центр кредит", "bcc"],
  homecredit: ["home credit", "homecredit", "хоум кредит"],
  eurasian: ["eurasian", "евразийский"],
  bereke: ["bereke", "береке"],
  rbk: ["rbk", "рбк"],
  wise: ["wise"],
  revolut: ["revolut", "револют"],
  tbc: ["tbc"],
  bog: ["bank of georgia", "банк грузии"],
  optima: ["optima", "оптима"],
  mbank: ["mbank", "мбанк"],
  ameria: ["ameria", "америя"],
  kapitalbank: ["kapitalbank", "капиталбанк"],
};

/** The preset a free-text bank name names, or null. */
export const bankIconFor = (bank: string): string | null => {
  const name = bank.toLowerCase();
  for (const key of BANK_ICON_KEYS) {
    if ((BANK_ALIASES[key] ?? []).some((alias) => name.includes(alias))) {
      return key;
    }
  }
  return null;
};

/** The icon of a crypto asset: its own preset (`usdt`, `usdc`), or null for another asset. */
export const cryptoIconFor = (currency: string): string | null => {
  const key = currency.trim().toLowerCase();
  return PAYMENT_ICON_PRESETS.some((preset) => preset.kind === "crypto" && preset.key === key) ? key : null;
};
