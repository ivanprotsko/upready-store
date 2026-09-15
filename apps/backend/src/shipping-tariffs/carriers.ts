/**
 * Delivery services a shop owner can name on a method. None of them is an API
 * integration: the shop prices the parcel by its own tariff and types the
 * tracking number in by hand after the shipment (the panel's
 * `orders/:id/create-shipment` form already carries that field). The name says
 * so out loud — «СДЭК (расчёт по тарифу магазина)» — because a buyer reading
 * «СДЭК» alone would expect the carrier's own calculator.
 *
 * `key` is what a method keeps in `data.carrier`; the panel shows the label
 * next to the method and the instruction under the tracking field.
 */

export type ShippingCarrier = {
  key: string;
  /** Short name in the panel's own lists. */
  label: string;
  /** What the buyer sees as the method name when the owner builds from a preset. */
  method_name: string;
  /** Default buyer-facing description of the method. */
  description: string;
  /** Default delivery-time hint, plain text. */
  delivery_hint: string | null;
  /** One paragraph for the owner: what she has to do by hand for this carrier. */
  instruction: string;
  /** Where the owner looks up a tracking number, shown next to the shipment form. */
  tracking_hint: string | null;
};

export const SHIPPING_CARRIERS: ShippingCarrier[] = [
  {
    key: "cdek",
    label: "СДЭК",
    method_name: "СДЭК (расчёт по тарифу магазина)",
    description: "Отправляем через СДЭК. Трек-номер придёт письмом после отправки заказа.",
    delivery_hint: "3–7 дней",
    instruction:
      "Цену считает магазин по вашему тарифу (базовая ставка + цена за килограмм по зоне), а не калькулятор СДЭК. " +
      "После оплаты создайте отправление в личном кабинете СДЭК, затем откройте заказ в панели, нажмите «Создать отгрузку» " +
      "и впишите номер накладной — покупатель увидит его в своём кабинете и получит письмо.",
    tracking_hint: "Номер накладной из личного кабинета СДЭК, 10–14 цифр.",
  },
  {
    key: "post_ru",
    label: "Почта России",
    method_name: "Почта России (расчёт по тарифу магазина)",
    description: "Отправляем Почтой России. Трек-номер придёт письмом после отправки заказа.",
    delivery_hint: "5–14 дней",
    instruction:
      "Цену считает магазин по вашему тарифу, а не калькулятор Почты. Отправив посылку, впишите трек-номер " +
      "из квитанции в отгрузку заказа — покупатель увидит его в кабинете и в письме.",
    tracking_hint: "Трек-номер из квитанции, 14 цифр.",
  },
  {
    key: "courier",
    label: "Свой курьер",
    method_name: "Курьером",
    description: "Привезём по адресу. Дату согласуем после оплаты.",
    delivery_hint: "1–2 дня",
    instruction: "Доставляете сами или своим курьером. Трек-номер не нужен — отметьте заказ отгруженным.",
    tracking_hint: null,
  },
  {
    key: "pickup",
    label: "Самовывоз",
    method_name: "Самовывоз",
    description: "Заберите заказ у продавца.",
    delivery_hint: "Адрес пришлём после заказа",
    instruction: "Покупатель забирает заказ сам. Адрес и время пришлите ему в письме или сообщением.",
    tracking_hint: null,
  },
];

export const carrierByKey = (key: string | null | undefined): ShippingCarrier | null =>
  key ? (SHIPPING_CARRIERS.find((carrier) => carrier.key === key) ?? null) : null;

export const carrierLabel = (key: string | null | undefined): string | null => carrierByKey(key)?.label ?? null;
