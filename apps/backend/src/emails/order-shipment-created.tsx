import {
  Button,
  Heading,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";
import * as s from "./lib/styles";
import {
  type EmailLocale,
  DEFAULT_EMAIL_LOCALE,
  getEmailTranslator,
} from "./i18n";
import { useEmailShop } from "./lib/shop";

/**
 * A shipping label as the Fulfillment Module stores it. Tracking lives here and
 * nowhere else: `create-fulfillment` never receives a tracking number, only
 * `create-shipment` does, through its `labels` input.
 */
export type FulfillmentLabel = {
  tracking_number?: string | null;
  tracking_url?: string | null;
};

export type OrderShipmentCreatedEmailProps = {
  order: {
    id: string;
    display_id?: number | string;
    email?: string;
    shipping_address?: {
      first_name?: string;
      last_name?: string;
      city?: string;
    };
  };
  labels?: FulfillmentLabel[];
  /** Carrier name the owner typed next to the tracking number (`fulfillment.metadata.carrier`). */
  carrier?: string | null;
  locale?: EmailLocale;
};

export function OrderShipmentCreatedEmail({
  order,
  labels = [],
  carrier = null,
  locale = DEFAULT_EMAIL_LOCALE,
}: OrderShipmentCreatedEmailProps) {
  const shop = useEmailShop();
  const { t, html } = getEmailTranslator(locale);
  const id = order.display_id ?? order.id;
  const customerName = [
    order.shipping_address?.first_name,
    order.shipping_address?.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const ordersUrl = `${shop.storefrontUrl}/account/orders`;
  const city = order.shipping_address?.city;
  const tracked = labels.filter((label) => label.tracking_number);
  // «СДЭК 1234567890»: the carrier in front of the number, no new catalog key.
  // The number comes off the label; naming `trackingText` on the right-hand
  // side instead recursed until the stack gave out, and since the subscriber
  // renders this template inside the `shipment.created` handler, EVERY shipment
  // died there and no customer was ever told their parcel had left (measured
  // 2026-09-15 on a clone of the client's database: «An error occurred while
  // processing shipment.created … at trackingText (order-shipment-created.tsx:67)»,
  // no letter in the inbox).
  const trackingText = (label: FulfillmentLabel) => {
    const number = label.tracking_number ?? "";
    return carrier ? `${carrier} ${number}`.trim() : number;
  };

  return (
    <EmailLayout preview={t("Shipment.preview", { id })} locale={locale}>
      <Heading style={s.heading}>
        {customerName
          ? t("Shipment.headingWithName", { name: customerName })
          : t("Shipment.headingAnon")}
      </Heading>

      <Text
        style={s.paragraph}
        dangerouslySetInnerHTML={{
          __html: [
            html("Shipment.bodyOrder", { id }),
            city ? html("Shipment.deliveryCity", { city }) : "",
          ]
            .filter(Boolean)
            .join(" "),
        }}
      />

      <Section style={s.card}>
        <Text style={s.cardTitle}>{t("Shipment.trackingTitle")}</Text>

        {tracked.length > 0 ? (
          tracked.map((label, i) => (
            <Row key={i} style={s.trackRow}>
              <Column>
                <Text style={s.trackLabel}>{t("Shipment.trackLabel")}</Text>
                {label.tracking_url ? (
                  <a href={label.tracking_url} style={s.trackLink}>
                    {trackingText(label)}
                  </a>
                ) : (
                  <Text style={s.trackValue}>{trackingText(label)}</Text>
                )}
              </Column>
            </Row>
          ))
        ) : (
          <Text style={{ ...s.paragraph, margin: 0 }}>
            {t("Shipment.noTracking")}
          </Text>
        )}
      </Section>

      <Text style={s.paragraph}>{t("Shipment.deliveryTime")}</Text>

      <Section style={s.buttonSection}>
        <Button href={ordersUrl} style={s.button}>
          {t("Common.trackOrder")}
        </Button>
      </Section>

      <Text style={s.footerNote}>
        {t("Common.questionsPrefix")}{" "}
        <a href={`mailto:${shop.email}`} style={s.link}>
          {shop.email}
        </a>
        {shop.phone ? (
          <>
            {" "}
            {t("Common.orCall")}{" "}
            <a href={`tel:${shop.phone.replace(/\s/g, "")}`} style={s.link}>
              {shop.phone}
            </a>
          </>
        ) : null}
      </Text>
    </EmailLayout>
  );
}

export default OrderShipmentCreatedEmail;
