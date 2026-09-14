import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";
import {
  type EmailLocale,
  DEFAULT_EMAIL_LOCALE,
  getEmailTranslator,
} from "./i18n";
import { useEmailShop } from "./lib/shop";
import * as s from "./lib/styles";

type EmailLayoutProps = {
  preview: string;
  children: React.ReactNode;
  locale?: EmailLocale;
};

export function EmailLayout({
  preview,
  children,
  locale = DEFAULT_EMAIL_LOCALE,
}: EmailLayoutProps) {
  const shop = useEmailShop();
  const { t, dir } = getEmailTranslator(locale);
  const contactLine = [shop.address, shop.email, shop.phone]
    .filter(Boolean)
    .join(" · ");

  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={s.body}>
        <Container style={{ ...s.container, direction: dir }}>
          <Section style={s.header}>
            <Text style={s.brand}>{shop.name}</Text>
          </Section>

          <Section style={s.content}>{children}</Section>

          <Hr style={s.divider} />
          <Section style={s.footer}>
            <Text style={s.footerText}>
              {t("Layout.copyright", { year: new Date().getFullYear() })}
            </Text>
            {contactLine ? (
              <Text style={s.footerText}>{contactLine}</Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
