import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import type { NotificationTypes } from "@medusajs/framework/types";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { isSyntheticTelegramEmail } from "../../auth-telegram/lib/identity";

type InjectedDependencies = {
  logger: Logger;
};

type SmtpOptions = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  from_name?: string;
  reply_to?: string;
};

export class SmtpNotificationService extends AbstractNotificationProviderService {
  static identifier = "smtp";

  private transporter: Transporter;
  private options: SmtpOptions;
  private logger: Logger;

  constructor({ logger }: InjectedDependencies, options: SmtpOptions) {
    super();
    this.logger = logger;
    this.options = options;

    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port ?? 587,
      secure: options.secure ?? false,
      auth:
        options.user && options.pass
          ? { user: options.user, pass: options.pass }
          : undefined,
    });
  }

  static validateOptions(options: Record<string, any>) {
    if (!options.host) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "SMTP host is required in the provider's options.",
      );
    }
  }

  /**
   * Builds the `From` header. The display name goes in as the name, so the
   * inbox shows the SHOP rather than the bare address, and the subject line no
   * longer has to carry it.
   *
   * `nodemailer` takes the name and the address separately and encodes the name
   * itself, which is what makes a non-ASCII store name arrive intact. An
   * `SMTP_FROM` that already spells out its own display name is left alone.
   *
   * The ADDRESS is always the platform's (t08-order-notifications). One backend
   * sends for every shop through one SMTP account, and an address a shop owner
   * typed would be a domain we cannot sign for: SPF and DMARC reject it, and
   * letting anyone put any address there is the first thing an abuser asks for.
   * A shop's own identity therefore reaches the inbox as the display NAME plus
   * a `Reply-To` of its own.
   */
  private buildFrom(
    senderName?: string | null,
  ): string | { name: string; address: string } | undefined {
    const address = this.options.from ?? this.options.user;

    if (!address) {
      return undefined;
    }

    const name = (senderName ?? this.options.from_name)?.trim();

    if (!name || address.includes("<")) {
      return address;
    }

    return { name, address };
  }

  /**
   * The per-shop sender the subscriber attached to the notification
   * (`src/emails/lib/notify.ts`). Absent, empty or the wrong shape means the
   * platform's own defaults, never a crash: a malformed field must not stop an
   * order confirmation.
   */
  private senderFrom(data: unknown): { name?: string; reply_to?: string } {
    const sender = (data as { sender?: unknown } | undefined)?.sender;

    if (!sender || typeof sender !== "object") {
      return {};
    }

    const { name, reply_to: replyTo } = sender as { name?: unknown; reply_to?: unknown };

    return {
      name: typeof name === "string" && name.trim() !== "" ? name : undefined,
      reply_to: typeof replyTo === "string" && replyTo.trim() !== "" ? replyTo : undefined,
    };
  }

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO,
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    const content = notification.content as
      | { subject?: string; html?: string; text?: string }
      | undefined;

    if (!content) {
      this.logger.warn("[smtp] No content in notification, skipping");
      return {};
    }

    // The ONE place every customer-facing email funnels through (the only
    // provider registered on the `email` channel). `tg_<id>@telegram.local`
    // is a key for a Telegram buyer, never a real inbox — live mail is ON
    // (t08), so a Telegram sign-in that reaches this far without the address
    // being swapped for the buyer's real contact method must be caught here,
    // not bounce off a mail server (t-2026-10-02-telegram-auth).
    if (isSyntheticTelegramEmail(notification.to)) {
      this.logger.info(
        `[smtp] Skipping send to synthetic Telegram address ${notification.to}`,
      );
      return {};
    }

    const sender = this.senderFrom((notification as { data?: unknown }).data);

    const mailOptions = {
      from: this.buildFrom(sender.name),
      replyTo: sender.reply_to ?? this.options.reply_to ?? undefined,
      to: notification.to,
      subject: content.subject ?? "(no subject)",
      html: content.html,
      text: content.text,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.info(`[smtp] Email sent: ${info.messageId}`);
      return { id: info.messageId };
    } catch (err: any) {
      this.logger.error(`[smtp] Failed to send email: ${err?.message}`);
      throw err;
    }
  }
}
