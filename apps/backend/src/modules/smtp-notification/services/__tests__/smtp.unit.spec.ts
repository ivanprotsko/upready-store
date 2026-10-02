import nodemailer from "nodemailer";
import { SmtpNotificationService } from "../smtp";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

describe("SmtpNotificationService — synthetic Telegram address guard", () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: "test-message-id" });
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    sendMail.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  const service = () =>
    new SmtpNotificationService(
      { logger: logger as any },
      { host: "smtp.example.com", from: "noreply@example.com" },
    );

  const notification = (to: string) => ({
    to,
    channel: "email",
    template: "welcome",
    content: { subject: "Hi", html: "<p>hi</p>", text: "hi" },
  });

  it("never calls sendMail for a synthetic tg_<id>@telegram.local address (live mail is ON, t08)", async () => {
    const result = await service().send(notification("tg_42@telegram.local") as any);
    expect(sendMail).not.toHaveBeenCalled();
    expect(result).toEqual({});
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("tg_42@telegram.local"));
  });

  it("still sends to a real address (Yandex, email/password)", async () => {
    await service().send(notification("buyer@yandex.ru") as any);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "buyer@yandex.ru" });
  });
});
