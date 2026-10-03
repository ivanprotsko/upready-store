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

export type CourseAccessLink = {
  title: string;
  /** The handle of the product the course is sold under: its page is the course page. */
  handle: string;
};

/**
 * The course page on the shop's own domain, the product page the storefront
 * opens a course on («Мои курсы» links there too). No locale segment, like
 * every other link in these letters: the storefront adds the shop's default.
 */
export const courseAccessUrl = (storefrontUrl: string, handle: string) =>
  `${storefrontUrl}/products/${encodeURIComponent(handle)}`;

export type CourseAccessEmailProps = {
  order: {
    id: string;
    display_id?: number | string;
    email?: string;
    shipping_address?: {
      first_name?: string;
      last_name?: string;
    };
  };
  courses: CourseAccessLink[];
  locale?: EmailLocale;
};

/**
 * «Доступ к курсу открыт» (t-cherk-com-hotfix batch 5): sent by
 * `grant-course-on-paid` once the owner confirms the payment, which is what
 * the checkout promises («Доступ к курсу придёт на e-mail после подтверждения
 * оплаты»). One «Перейти к курсу» button per course the order granted.
 */
export function CourseAccessEmail({
  order,
  courses,
  locale = DEFAULT_EMAIL_LOCALE,
}: CourseAccessEmailProps) {
  const shop = useEmailShop();
  const { t, html } = getEmailTranslator(locale);
  const id = order.display_id ?? order.id;
  const customerName = [
    order.shipping_address?.first_name,
    order.shipping_address?.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <EmailLayout preview={t("CourseAccess.preview", { id })} locale={locale}>
      <Heading style={s.heading}>
        {customerName
          ? t("CourseAccess.headingWithName", { name: customerName })
          : t("CourseAccess.headingAnon")}
      </Heading>

      <Text
        style={s.paragraph}
        dangerouslySetInnerHTML={{ __html: html("CourseAccess.body", { id }) }}
      />

      {courses.map((course) => (
        <Section key={course.handle} style={s.card}>
          <Text style={s.cardTitle}>{course.title}</Text>
          <Section style={s.buttonSection}>
            <Button href={courseAccessUrl(shop.storefrontUrl, course.handle)} style={s.button}>
              {t("CourseAccess.button")}
            </Button>
          </Section>
        </Section>
      ))}

      {order.email && (
        <Text style={s.hint}>
          {t("CourseAccess.signIn", { email: order.email })}
        </Text>
      )}

      <Text style={s.footerNote}>
        {t("Common.questionsPrefix")}{" "}
        <a href={`mailto:${shop.email}`} style={s.link}>
          {shop.email}
        </a>
      </Text>
    </EmailLayout>
  );
}

export default CourseAccessEmail;
