import tls from "node:tls";

/**
 * Whether a site's own domain answers HTTPS with a certificate the platform
 * would accept, for the «Сайты» list (t-2026-09-24-n12). Nothing stores this:
 * certificates for custom domains are issued on demand by the proxy
 * (`docs/multitenancy/hosting-spec.md`), so the only honest source is a TLS
 * handshake with the host itself. Technical hosts (`<handle>.<base>`) are
 * covered by the platform's wildcard certificate and are never probed.
 *
 * - `valid`: the handshake succeeded and the chain verified for this name.
 * - `invalid`: something answered, but with a certificate that does not verify
 *   (expired, self-signed, another name). Usually «not issued yet».
 * - `unreachable`: no answer within the timeout (DNS not pointed yet, port
 *   closed).
 */
export type CertificateStatus = { status: "valid" | "invalid" | "unreachable"; valid_to: string | null };

export const probeCertificate = (host: string, timeoutMs = 3000): Promise<CertificateStatus> =>
  new Promise((resolve) => {
    let settled = false;
    const done = (result: CertificateStatus) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false });
    socket.setTimeout(timeoutMs, () => done({ status: "unreachable", valid_to: null }));
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const validTo = certificate?.valid_to ? new Date(certificate.valid_to).toISOString() : null;
      done({ status: socket.authorized ? "valid" : "invalid", valid_to: validTo });
    });
    socket.once("error", () => done({ status: "unreachable", valid_to: null }));
  });
