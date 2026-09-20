import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";

/**
 * Two local sinks for the notification seam test (t08-order-notifications).
 *
 * The only way to know what a customer receives is to receive it, so the test
 * takes delivery itself: a minimal SMTP server that keeps whole messages, and a
 * stand-in for the Telegram Bot API that keeps whole `sendMessage` bodies. Both
 * speak the real protocol the code under test speaks — nothing in `src` is
 * mocked, stubbed or given a test branch.
 */

export type CapturedEmail = {
  from: string;
  to: string[];
  /** The DATA part verbatim, headers and body, with the dot-stuffing undone. */
  raw: string;
};

/**
 * The smallest SMTP server nodemailer will talk to: greet, accept EHLO, MAIL,
 * RCPT and DATA, and keep what arrives. No TLS and no AUTH, which is why the
 * provider is configured without a user or a password in this test.
 */
export const startSmtpSink = async (
  port: number,
): Promise<{ messages: CapturedEmail[]; close: () => Promise<void>; server: TcpServer }> => {
  const messages: CapturedEmail[] = [];

  const server = createTcpServer((socket) => {
    let buffer = "";
    let inData = false;
    let data = "";
    let from = "";
    let to: string[] = [];

    socket.setEncoding("utf8");
    socket.write("220 sink ESMTP\r\n");

    socket.on("data", (chunk: string) => {
      buffer += chunk;

      for (;;) {
        const index = buffer.indexOf("\r\n");
        if (index < 0) {
          break;
        }
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push({ from, to, raw: data.replace(/^\.\./gm, ".") });
            data = "";
            from = "";
            to = [];
            socket.write("250 2.0.0 Ok: queued\r\n");
            continue;
          }
          data += `${line}\n`;
          continue;
        }

        const command = line.slice(0, 4).toUpperCase();

        if (command === "EHLO" || command === "HELO") {
          socket.write("250-sink\r\n250 8BITMIME\r\n");
        } else if (command === "MAIL") {
          from = line.slice(line.indexOf(":") + 1).trim();
          socket.write("250 2.1.0 Ok\r\n");
        } else if (command === "RCPT") {
          to.push(line.slice(line.indexOf(":") + 1).trim());
          socket.write("250 2.1.5 Ok\r\n");
        } else if (command === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command === "QUIT") {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else if (command === "RSET" || command === "NOOP") {
          socket.write("250 2.0.0 Ok\r\n");
        } else {
          socket.write("250 2.0.0 Ok\r\n");
        }
      }
    });

    socket.on("error", () => undefined);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    messages,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

export type CapturedTelegram = { method: string; token: string; body: Record<string, unknown> };

/** Answers like the Bot API and keeps every call, so the test can read the message. */
export const startTelegramSink = async (
  port: number,
): Promise<{ calls: CapturedTelegram[]; close: () => Promise<void>; server: HttpServer }> => {
  const calls: CapturedTelegram[] = [];
  let messageId = 1000;

  const server = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const [, tokenPart = "", method = ""] = (req.url ?? "").split("/");
      calls.push({
        method,
        token: tokenPart.replace(/^bot/, ""),
        body: body ? (JSON.parse(body) as Record<string, unknown>) : {},
      });
      messageId += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: messageId } }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    calls,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

/**
 * The parts of a captured message, decoded. A real letter is MIME: the text
 * part arrives base64, the HTML part quoted-printable with soft line breaks
 * that cut URLs in half. Asserting a link on the raw bytes therefore proves
 * nothing either way, so the test reads what the CUSTOMER's mail client would
 * show.
 */
export type DecodedEmail = {
  headers: string;
  /** Every decoded part concatenated: what the reader can actually see. */
  body: string;
  subject: string;
  from: string;
  replyTo: string;
};

const decodeWords = (value: string): string =>
  value.replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, base64: string) =>
    Buffer.from(base64, "base64").toString("utf8"),
  );

const decodeQuotedPrintable = (value: string): string =>
  Buffer.from(
    value
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .split("")
      .map((char) => char.charCodeAt(0) & 0xff)
      .map((code) => String.fromCharCode(code))
      .join(""),
    "binary",
  ).toString("utf8");

const headerOf = (headers: string, name: string): string => {
  const match = new RegExp(`^${name}:\\s*(.*)$`, "im").exec(headers);
  return match ? decodeWords(match[1].trim()) : "";
};

export const decodeEmail = (message: CapturedEmail): DecodedEmail => {
  const raw = message.raw.replace(/\r\n/g, "\n");
  const split = raw.indexOf("\n\n");
  const headers = split < 0 ? raw : raw.slice(0, split);
  const rest = split < 0 ? "" : raw.slice(split + 2);

  const parts = rest.split(/^--.*$/m).filter((part) => part.trim() !== "");
  const body = parts
    .map((part) => {
      const inner = part.indexOf("\n\n");
      const partHeaders = inner < 0 ? "" : part.slice(0, inner);
      const content = inner < 0 ? part : part.slice(inner + 2);

      if (/base64/i.test(partHeaders)) {
        return Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8");
      }
      if (/quoted-printable/i.test(partHeaders)) {
        return decodeQuotedPrintable(content);
      }
      return content;
    })
    .join("\n");

  return {
    headers,
    body,
    subject: headerOf(headers, "Subject"),
    from: headerOf(headers, "From"),
    replyTo: headerOf(headers, "Reply-To"),
  };
};
