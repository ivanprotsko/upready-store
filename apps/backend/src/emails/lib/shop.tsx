import { createContext, createElement, useContext, type ReactElement } from "react";
import { render } from "@react-email/render";
import {
  STORE_ADDRESS,
  STORE_EMAIL,
  STORE_NAME,
  STORE_PHONE,
  STOREFRONT_URL,
} from "../i18n";

/**
 * WHICH SHOP a letter is from (t08-order-notifications).
 *
 * Every template used to read `STOREFRONT_URL` and `STORE_NAME` straight from
 * the environment. One backend now serves every shop, and on the multi-tenant
 * host `STOREFRONT_URL` is the ENGINE's domain — so a customer's "track your
 * order" link pointed at a site that is not the shop they bought from. The
 * values are therefore per-letter, and they arrive through context rather than
 * as a prop on each template: a prop threaded through nine templates is a prop
 * one of them will forget, and a forgotten prop here is a wrong link in a
 * customer's inbox with nothing to notice it.
 *
 * The defaults are the old environment values, so a single-store install and
 * every template rendered outside a provider (a preview, a test) behave exactly
 * as they did.
 */

export type EmailShop = {
  name: string;
  /** The shop's OWN public origin, no trailing slash. */
  storefrontUrl: string;
  email: string;
  address: string;
  phone: string;
};

export const platformEmailShop = (): EmailShop => ({
  name: STORE_NAME,
  storefrontUrl: STOREFRONT_URL.replace(/\/$/, ""),
  email: STORE_EMAIL,
  address: STORE_ADDRESS,
  phone: STORE_PHONE,
});

const EmailShopContext = createContext<EmailShop | null>(null);

export const EmailShopProvider = ({
  shop,
  children,
}: {
  shop: EmailShop;
  children: React.ReactNode;
}) => createElement(EmailShopContext.Provider, { value: shop }, children);

export const useEmailShop = (): EmailShop => useContext(EmailShopContext) ?? platformEmailShop();

/**
 * Renders a template as the given shop. The one place a letter's HTML is
 * produced, so no subscriber can render one without saying which shop it is
 * from.
 */
export const renderForShop = (shop: EmailShop, element: ReactElement): Promise<string> =>
  render(createElement(EmailShopProvider, { shop, children: element }));
