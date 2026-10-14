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
import { type FulfillmentLabel, trackingLine, trackingUrl } from "./lib/tracking";

/**
 * Tracking lives on the label and nowhere else: `create-fulfillment` never
 * receives a tracking number, only `create-shipment` does, through its
 * `labels` input.
 */
export type { FulfillmentLabel };

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
  const trackingText = (label: FulfillmentLabel) => trackingLine(label, carrier);
  // The number is the link when the label carries the carrier's page
  // (`tracking_url`, written by ApiShip and direct СДЭК); plain text otherwise.
  const trackingHref = (label: FulfillmentLabel) => trackingUrl(label);

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
          tracked.map((label, i) => {
            const href = trackingHref(label);
            return (
              <Row key={i} style={s.trackRow}>
                <Column>
                  <Text style={s.trackLabel}>{t("Shipment.trackLabel")}</Text>
                  {href ? (
                    <a href={href} style={s.trackLink}>
                      {trackingText(label)}
                    </a>
                  ) : (
                    <Text style={s.trackValue}>{trackingText(label)}</Text>
                  )}
                </Column>
              </Row>
            );
          })
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
