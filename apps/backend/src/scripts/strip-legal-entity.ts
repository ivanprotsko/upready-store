import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../modules/course";
import type CourseModuleService from "../modules/course/service";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import {
  isEffectivelyEmpty,
  matches,
  matchesWithContext,
  stripInline,
  stripLines,
} from "./legal-entity-patterns";

/**
 * «никаких ссылок на ИП Черкашина и т.д. Быть не должно» (t-cherk-com-hotfix
 * batch 6, item 8, Ivan 03.10; lead's 02:20 correction widened the scope to
 * `tenant_requisites` and `src/tenant-legal`).
 *
 * TWO kinds of fix, over one tenant:
 *
 * 1. **`tenant_requisites`** — `legal_name`, `ogrn`, `inn`, `legal_address`
 *    feed `{{ФИО_ИП}}`/`{{ОГРНИП}}`/`{{ИНН}}`/`{{ЮР_АДРЕС}}` on every page
 *    (`tenant-legal/requisites.ts`), and `redact.ts` ALREADY hides any block
 *    (table row, list item, paragraph) that still carries an unfilled token
 *    when `GET /store/tenant/pages/:key` renders it
 *    (`api/store/tenant/pages/[key]/route.ts`). So blanking these four
 *    fields is the one write that cleans the offer and privacy pages — no
 *    page content needs editing for that part. `phone`, `email`,
 *    `return_address` and the rest stay: they are contact and operational
 *    facts, not the entity's identity.
 *
 * 2. **Literal mentions** in `tenant_page.title`/`.body`, `lesson.body` and
 *    `tenant_product_attribute.name` — plain prose the owner or an importer
 *    typed, not behind a token. For each:
 *    - a `tenant_page` whose KEY is `"legal"` (the dedicated legal-notice
 *      page), or whose body is effectively empty once the matching lines are
 *      gone, is unpublished rather than left as a near-blank page;
 *    - otherwise a `tenant_page.body` or `lesson.body` match is removed LINE
 *      by line — a mention usually sits on its own disclosure line
 *      («Продавец: ИП…»), and this never touches a line without one;
 *    - a `tenant_page.title` or `tenant_product_attribute.name` match is
 *      removed as a substring, with the leftover punctuation tidied.
 *    A footer link to an unpublished or now-pageless key is the
 *    storefront's own job (Fable, `modules/layout/templates/footer`), not
 *    this script's: nothing here touches `apps/storefront`.
 *
 * Every match is PRINTED before any write, apply or not.
 *
 *   npx medusa exec ./src/scripts/strip-legal-entity.js tenant=<handle>          (lists matches, writes nothing)
 *   npx medusa exec ./src/scripts/strip-legal-entity.js tenant=<handle> apply    (writes)
 *   live: docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/strip-legal-entity.js tenant=cherkashino-com apply
 *
 * Idempotent: a second run finds nothing left to strip once the first apply
 * has run (the requisites fields are already null, the matching lines and
 * substrings are already gone).
 */
const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

type RequisitesRow = {
  id: string;
  legal_name: string | null;
  ogrn: string | null;
  inn: string | null;
  legal_address: string | null;
};

type PageRow = { id: string; key: string; locale: string; title: string; body: string; published: boolean };
type LessonRow = { id: string; course_id: string; title: string; body: string };
type AttributeRow = { id: string; name: string };

export default async function stripLegalEntity({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const apply = args.includes("apply");
  const handle = readArg(args, "tenant");

  if (!handle) {
    throw new Error("strip-legal-entity: pass tenant=<handle> (and apply to write)");
  }

  const {
    data: [tenant],
  } = await query.graph({ entity: "tenant", fields: ["id", "handle"], filters: { handle } });

  if (!tenant) {
    throw new Error(`strip-legal-entity: tenant "${handle}" was not found`);
  }

  const tenantId = tenant.id as string;
  const tenantModuleService = container.resolve<TenantModuleService>(TENANT_MODULE);
  const courseModuleService = container.resolve<CourseModuleService>(COURSE_MODULE);

  let changes = 0;

  // ---- 1. tenant_requisites ------------------------------------------------
  const [requisites] = (await tenantModuleService.listTenantRequisites({
    tenant_id: tenantId,
  })) as RequisitesRow[];

  if (requisites && (requisites.legal_name || requisites.ogrn || requisites.inn || requisites.legal_address)) {
    logger.info(
      `strip-legal-entity: [requisites] legal_name="${requisites.legal_name ?? ""}" ogrn="${requisites.ogrn ?? ""}" inn="${requisites.inn ?? ""}" legal_address="${requisites.legal_address ?? ""}"`,
    );
    changes += 1;
    if (apply) {
      await tenantModuleService.updateTenantRequisites({
        id: requisites.id,
        legal_name: null,
        ogrn: null,
        inn: null,
        legal_address: null,
      });
      logger.info("strip-legal-entity: [requisites] cleared legal_name, ogrn, inn, legal_address");
    }
  } else {
    logger.info("strip-legal-entity: [requisites] nothing to clear");
  }

  // ---- 2. tenant_page -------------------------------------------------------
  const pages = (await tenantModuleService.listTenantPages({ tenant_id: tenantId })) as PageRow[];

  for (const page of pages) {
    if (!matches(page.title) && !matches(page.body)) {
      continue;
    }
    const where = `tenant_page "${page.key}" (${page.locale})`;
    for (const hit of [...matchesWithContext(page.title), ...matchesWithContext(page.body)]) {
      logger.info(`strip-legal-entity: [${where}] ${hit}`);
    }
    changes += 1;

    const strippedTitle = stripInline(page.title);
    const strippedBody = stripLines(page.body);
    const unpublish = page.key === "legal" || isEffectivelyEmpty(strippedBody.text);

    if (!apply) {
      continue;
    }

    if (unpublish && page.published) {
      await tenantModuleService.updateTenantPages({ id: page.id, published: false });
      logger.info(`strip-legal-entity: [${where}] unpublished (only about the legal entity, or empty once stripped)`);
      continue;
    }

    await tenantModuleService.updateTenantPages({
      id: page.id,
      title: strippedTitle.text,
      body: strippedBody.text,
    });
    logger.info(
      `strip-legal-entity: [${where}] removed ${strippedTitle.removed} title mention(s), ${strippedBody.removed} body line(s)`,
    );
  }

  // ---- 3. lesson.body ---------------------------------------------------------
  const { data: lessonRows } = await query.graph({
    entity: "lesson",
    fields: ["id", "course_id", "title", "body"],
    filters: { tenant_id: tenantId },
  });

  for (const lesson of lessonRows as LessonRow[]) {
    if (!matches(lesson.body)) {
      continue;
    }
    const where = `lesson "${lesson.title}" (${lesson.id})`;
    for (const hit of matchesWithContext(lesson.body)) {
      logger.info(`strip-legal-entity: [${where}] ${hit}`);
    }
    changes += 1;

    if (!apply) {
      continue;
    }
    const { text, removed } = stripLines(lesson.body);
    await courseModuleService.updateLessons({ id: lesson.id, body: text });
    logger.info(`strip-legal-entity: [${where}] removed ${removed} body line(s)`);
  }

  // ---- 4. tenant_product_attribute.name ------------------------------------
  const attributes = (await tenantModuleService.listTenantProductAttributes({
    tenant_id: tenantId,
  })) as AttributeRow[];

  for (const attribute of attributes) {
    if (!matches(attribute.name)) {
      continue;
    }
    const where = `tenant_product_attribute (${attribute.id})`;
    for (const hit of matchesWithContext(attribute.name)) {
      logger.info(`strip-legal-entity: [${where}] ${hit}`);
    }
    changes += 1;

    if (!apply) {
      continue;
    }
    const { text, removed } = stripInline(attribute.name);
    await tenantModuleService.updateTenantProductAttributes({ id: attribute.id, name: text });
    logger.info(`strip-legal-entity: [${where}] removed ${removed} mention(s), name is now "${text}"`);
  }

  if (changes === 0) {
    logger.info(`strip-legal-entity: ${handle} — nothing found, already clean`);
  } else if (!apply) {
    logger.info(`strip-legal-entity: ${handle} — ${changes} place(s) found, dry run, nothing written; pass apply to write`);
  } else {
    logger.info(`strip-legal-entity: ${handle} — ${changes} place(s) cleaned`);
  }
}
