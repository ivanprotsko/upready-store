# Goal

Give the client's shop its own address, as far as the facts on disk allow, and leave a precise instruction for
whatever they do not allow. The deliverable is either a working domain or a one-page instruction that Ivan can
execute in ten minutes — never a guess.

## The facts you start from (do not re-derive them, verify them)

`{{MISSION_DIR}}/research/telegram-digest.md` §6 and `{{MISSION_DIR}}/research/chrxnasdmds-digest.md` §1:

- `cherkashino.ru` and `черкашино.рф` were registered on 2026-09-03 at reg.ru **on the owner**, but the
  administrator card holds a mix of Ivan's and the client's passport data; the reg.ru tickets were rejected on
  2026-09-14 and Ivan took the question on himself (#472573).
- Identification of the domain administrator under 569-ФЗ has not been passed. Without it a `.ru` domain does
  not serve.
- `olavka.ru` belongs to Ivan, who is a non-resident, is paid until 2027-07-19, and its DNS still points at the
  placeholder `31.31.198.57`.
- The platform's own zone is `shipshift.dev`; the move to `upready.dev` has not been done
  (`specs/tenant-address/CANONICAL.md`).

Platform side (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §2, measured 2026-09-12): the owner adds
a host in the panel at `/settings/domains` → `POST /tenants/domains {host}`; `mt-ingress-sync` writes it into
the traefik file provider within 15 seconds; Let's Encrypt issues over HTTP-01; the whole path took about
70 seconds. The CNAME target shown to owners is `stores.shipshift.dev`.

## Step plan

1. **Establish what access actually exists on this machine, by measuring.** Look for reg.ru or Cloudflare
   credentials for these zones in the places where our secrets live (`~/upready/.env.keys`,
   `~/upready/memory/secrets/`, `~/upready/specs/protected-infra/registry.json`). Record what you searched and
   what you found. A miss is an answer; write the command and its output.
2. **Check the current DNS from outside**, for both domains and for `stores.shipshift.dev`:
   `dig +short cherkashino.ru A; dig +short cherkashino.ru NS; dig +short xn--80apaahi7a3c.xn--p1ai A;
   dig +short stores.shipshift.dev`. Note that `черкашино.рф` is `xn--80apaahi7a3c.xn--p1ai` in punycode —
   verify that conversion with `idn` or `python3 -c "print('черкашино.рф'.encode('idna'))"` rather than trusting
   it from this text.
3. **Register the host on the tenant regardless of DNS.** `POST /tenants/domains` for `cherkashino.ru`,
   `www.cherkashino.ru` and the punycode form of `черкашино.рф`, and confirm each appears in the ingress
   configuration on the host (`ssh -n contabo 'grep -c cherkashino /data/coolify/proxy/dynamic/mt-tenants.yml'`).
   Doing this first means that the moment DNS points at us, the certificate is issued without another step.
4. **Do not change DNS of a protected zone.** The registry entry `agentcreatr-tribute-webhook` and the platform
   entry both live in zones this task must not touch; `DELETE`/`PUT`/`PATCH` on `dns_records` is blocked by the
   protected-infra guard and rightly so. If, and only if, you find credentials for the `cherkashino.ru` zone
   specifically, and that zone is not in the protected registry, add the CNAME and say exactly what you added.
   Otherwise, stop and write the instruction.
5. **Canonical behaviour.** Verify what the platform does once a custom domain exists: `is_primary`, the
   per-page 301 from every other address, and the handle alias. The capabilities inventory says these are on
   `dev` but were never verified live. Verify what you can on the shop's current address and report the rest as
   untested rather than as working.
6. **Write the instruction.** `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/domain-instruction.md`, in Russian, for
   Ivan, as a numbered list: what to fix in the reg.ru administrator card, which identification to pass and by
   whom, which two DNS records to create with their exact values, how to check it worked (the two commands), and
   how long the certificate takes. One page, no background.

## Acceptance

- The three hosts are registered on the tenant and visible in the ingress file. Quote the API responses and the
  grep count.
- `dig` output for both domains, quoted verbatim, with a one-line reading of what it means.
- Either the CNAME exists and `curl -I https://cherkashino.ru` returns 200 or 301 to the canonical address, or
  the instruction file exists and names the exact records. Both outcomes are a success for this task; claiming
  the first without the curl is not.
- The shop keeps answering on `https://cherkashino.shipshift.dev/ru` throughout. Check it at the end.

## What NOT to do

- Do not modify DNS in a protected zone, do not touch `olavka.ru`, and do not move the `shipshift.dev` zone.
- Do not buy a domain, do not open a support ticket, do not write to reg.ru.
- Do not invent a registrar password, an NS host or a record value.
- Do not deploy.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/domain-instruction.md
RESULT: OK <домены зарегистрированы на тенанте; DNS: сделано / нужна инструкция>
```
