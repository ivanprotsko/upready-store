import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";
import * as s from "./lib/styles";
import {
  type EmailLocale,
  DEFAULT_EMAIL_LOCALE,
  getEmailTranslator,
} from "./i18n";
import { useEmailShop } from "./lib/shop";

export type OrderTransferRequestEmailProps = {
  displayId: string | number;
  transferUrl: string;
  locale?: EmailLocale;
};

export function OrderTransferRequestEmail({
  displayId,
  transferUrl,
  locale = DEFAULT_EMAIL_LOCALE,
}: OrderTransferRequestEmailProps) {
  const shop = useEmailShop();
  const { t, html } = getEmailTranslator(locale);

  return (
    <EmailLayout
      preview={t("OrderTransfer.preview", { id: displayId })}
      locale={locale}
    >
      <Heading style={s.heading}>{t("OrderTransfer.heading")}</Heading>

      <Text
        style={s.paragraph}
        dangerouslySetInnerHTML={{
          __html: html("OrderTransfer.body", { id: displayId }),
        }}
      />

      <Section style={s.buttonSection}>
        <Button href={transferUrl} style={s.button}>
          {t("OrderTransfer.button")}
        </Button>
      </Section>

      <Text
        style={s.hint}
        dangerouslySetInnerHTML={{ __html: html("OrderTransfer.hint") }}
      />

      <Text style={s.footerNote}>
        {t("Common.questionsPrefix")}{" "}
        <a href={`mailto:${shop.email}`} style={s.link}>
          {shop.email}
        </a>
      </Text>
    </EmailLayout>
  );
}

export default OrderTransferRequestEmail;
