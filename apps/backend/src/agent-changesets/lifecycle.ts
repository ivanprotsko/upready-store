import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { decideAccess } from "../api/tenants/permissions";
import type { AllowedOp } from "./allow-list";
import { callAs, LOOPBACK_TIMEOUT_CODE, readAs, type Caller } from "./loopback";
import { checkOp, hashValue, OP_SPECS, type ChangesetOp, type OpValue } from "./ops";
import { isStageSite, stageTenantIdOf } from "./stage";

/**
 * draft → staged → published → rolled_back, or discarded from draft or staged
 * (t-2026-10-27-04, `models/agent-changeset.ts`). Every step runs its ops
 * through `loopback.ts` as the person who pressed the button, so the target
 * routes check that person's role the way they check the panel's.
 */

export type ChangesetStatus = "draft" | "staged" | "published" | "rolled_back" | "discarded";
export type ChangesetSource = "owner-voice" | "telegram" | "panel";

export type ChangesetRow = {
  id: string;
  tenant_id: string;
  stage_tenant_id: string | null;
  author_admin_id: string;
  author_email: string | null;
  source: ChangesetSource;
  summary: string | null;
  ops: ChangesetOp[];
  status: ChangesetStatus;
  snapshot: OpValue[] | null;
  published_hashes: string[] | null;
  result: Record<string, unknown> | null;
  staged_at: Date | string | null;
  published_at: Date | string | null;
  rolled_back_at: Date | string | null;
  discarded_at: Date | string | null;
  created_at?: Date | string;
};

/**
 * A step refused, with the HTTP status and the machine code the route answers
 * with, and whatever the panel needs to explain it (`details`).
 */
export class ChangesetRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const service = (container: MedusaContainer): TenantModuleService => container.resolve(TENANT_MODULE);

/** Each op with its allow-list row, or a refusal naming the first op the caller may not send. */
export const checkOpsFor = (caller: Caller, ops: unknown): { op: ChangesetOp; rule: AllowedOp }[] => {
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new ChangesetRefusal(400, "invalid_ops", "A changeset carries at least one op.");
  }
  if (ops.length > 50) {
    throw new ChangesetRefusal(400, "invalid_ops", "A changeset carries at most 50 ops.");
  }

  return ops.map((op, index) => {
    const check = checkOp(op);
    if (!check.ok) {
      throw new ChangesetRefusal(400, "op_denied", `Op ${index + 1}: ${check.reason}`, { op_index: index });
    }

    const typed = op as ChangesetOp;
    if (!decideAccess(caller.role, typed.method, typed.path).allowed) {
      throw new ChangesetRefusal(403, "op_forbidden", `Op ${index + 1}: your role may not make this change.`, {
        op_index: index,
      });
    }
    if (check.rule.roles && !check.rule.roles.includes(caller.role)) {
      throw new ChangesetRefusal(
        403,
        "op_forbidden",
        `Op ${index + 1}: only ${check.rule.roles.join(" and ")} may change this.`,
        { op_index: index },
      );
    }

    return { op: { method: typed.method, path: typed.path, ...(typed.body ? { body: typed.body } : {}) }, rule: check.rule };
  });
};

const requireStatus = (changeset: ChangesetRow, allowed: ChangesetStatus[], action: string) => {
  if (!allowed.includes(changeset.status)) {
    throw new ChangesetRefusal(
      409,
      "wrong_status",
      `A ${changeset.status} changeset cannot be ${action}.`,
      { status: changeset.status },
    );
  }
};

/**
 * Seconds a step may wait for the changeset's lock. In Medusa's providers the
 * same number is the lock's expiry, so it is well above a whole step: a long
 * publish must not lose its lock halfway.
 */
export const LOCK_TIMEOUT_SECONDS = 300;

/**
 * Runs `step` on the changeset `id` alone. Two requests for one changeset
 * (a double click, two tabs) take turns: the second re-reads the row inside
 * the lock, so it sees the status the first left and refuses on it.
 */
const withChangesetLock = async <T>(
  container: MedusaContainer,
  id: string,
  step: (fresh: ChangesetRow) => Promise<T>,
): Promise<T> => {
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  let started = false;

  try {
    return await locking.execute(
      `agent-changeset:${id}`,
      async () => {
        started = true;
        const [row] = await service(container).listAgentChangesets({ id }, { take: 1 });
        if (!row) {
          throw new MedusaError(MedusaError.Types.NOT_FOUND, `Agent changeset ${id} was not found.`);
        }
        return step(row as unknown as ChangesetRow);
      },
      { timeout: LOCK_TIMEOUT_SECONDS },
    );
  } catch (error) {
    if (!started) {
      throw new ChangesetRefusal(409, "busy", "This change is being applied by another request.");
    }
    throw error;
  }
};

/**
 * A read, write or hash read that threw (a loopback timeout, a dead socket)
 * after the first write: the ops written so far are undone and the step
 * refuses like a failed op answer. A timeout says the op may still have landed.
 */
const refuseThrown = async (
  error: unknown,
  index: number,
  where: string,
  undo: () => Promise<{ op_index: number; status: number; message: string }[]>,
  tail: string,
): Promise<never> => {
  if (error instanceof ChangesetRefusal) throw error;

  const timedOut = error instanceof MedusaError && error.code === LOOPBACK_TIMEOUT_CODE;
  const undone = await undo();
  const reason = timedOut
    ? "did not answer in time and may still have landed"
    : `broke off: ${(error as Error).message}`;
  throw new ChangesetRefusal(422, "op_failed", `Op ${index + 1} ${where} ${reason}.${tail}`, {
    op_index: index,
    ...(timedOut ? { op_timeout: true } : {}),
    undo_failures: undone,
  });
};

/** The answer's own message, for a refusal the panel shows as it is. */
const messageOf = (body: Record<string, unknown>): string =>
  typeof body.message === "string" ? body.message : typeof body.reason === "string" ? body.reason : "";

const readValue = async (
  container: MedusaContainer,
  caller: Caller,
  tenantId: string,
  op: ChangesetOp,
  rule: AllowedOp,
): Promise<OpValue> => {
  const spec = OP_SPECS[rule.kind];
  const answer = await readAs(container, caller, tenantId, spec.read(op));
  return answer ? spec.project(answer, op) : null;
};

/** Writes `befores` back in reverse order. Best effort: returns the ops that failed. */
const restoreAll = async (
  container: MedusaContainer,
  caller: Caller,
  tenantId: string,
  checked: { op: ChangesetOp; rule: AllowedOp }[],
  befores: OpValue[],
  upTo: number,
): Promise<{ op_index: number; status: number; message: string }[]> => {
  const failures: { op_index: number; status: number; message: string }[] = [];
  for (let index = upTo - 1; index >= 0; index -= 1) {
    const { op, rule } = checked[index];
    const restore = OP_SPECS[rule.kind].restore(op, befores[index]);
    if (!restore) continue;
    try {
      const answer = await callAs(container, caller, tenantId, restore);
      if (answer.status >= 400) {
        failures.push({ op_index: index, status: answer.status, message: messageOf(answer.body) });
      }
    } catch (error) {
      // A dead call (a timeout) is a failure to report; the next op still gets its undo.
      failures.push({ op_index: index, status: 504, message: (error as Error).message });
    }
  }
  return failures;
};

// ---- create

export type DraftInput = { source: ChangesetSource; summary?: string | null; ops: unknown };

export const createDraft = async (
  container: MedusaContainer,
  caller: Caller,
  input: DraftInput,
): Promise<ChangesetRow> => {
  const main = await service(container).retrieveTenant(caller.tenant_id);
  if (isStageSite(main.metadata)) {
    throw new ChangesetRefusal(400, "stage_site", "Changesets are made on the main site, not on its stage copy.");
  }

  const checked = checkOpsFor(caller, input.ops);

  const created = await service(container).createAgentChangesets({
    tenant_id: caller.tenant_id,
    stage_tenant_id: stageTenantIdOf(main.metadata),
    author_admin_id: caller.admin_id,
    author_email: caller.email,
    source: input.source,
    summary: input.summary ?? null,
    ops: checked.map(({ op }) => op) as unknown as Record<string, unknown>,
    status: "draft",
  });

  return created as unknown as ChangesetRow;
};

// ---- stage

export const applyToStage = (
  container: MedusaContainer,
  caller: Caller,
  changeset: ChangesetRow,
): Promise<ChangesetRow> =>
  withChangesetLock(container, changeset.id, (fresh) => applyToStageLocked(container, caller, fresh));

const applyToStageLocked = async (
  container: MedusaContainer,
  caller: Caller,
  changeset: ChangesetRow,
): Promise<ChangesetRow> => {
  requireStatus(changeset, ["draft"], "staged");
  const checked = checkOpsFor(caller, changeset.ops);

  const main = await service(container).retrieveTenant(changeset.tenant_id);
  const stageId = stageTenantIdOf(main.metadata);
  if (!stageId) {
    throw new ChangesetRefusal(
      409,
      "stage_missing",
      "This shop has no stage site yet. lead-devops makes one with `ensure-stage-site`.",
    );
  }

  const stageBefores: OpValue[] = [];
  const answers: { op_index: number; status: number; where: "stage" | "overlay" }[] = [];

  for (const [index, { op, rule }] of checked.entries()) {
    try {
      if (rule.scope === "product") {
        // The group shares its products: writing one on stage would write it on
        // the live shop. The op stays in the changeset and the stage storefront
        // overlays it (`overlay.ts`); here it is only checked to name a product
        // the main site can read.
        const value = await readValue(container, caller, changeset.tenant_id, op, rule);
        if (value === null) {
          throw new ChangesetRefusal(422, "op_failed", `Op ${index + 1}: the product was not found.`, { op_index: index });
        }
        stageBefores.push(null);
        answers.push({ op_index: index, status: 200, where: "overlay" });
        continue;
      }

      stageBefores.push(await readValue(container, caller, stageId, op, rule));
      const answer = await callAs(container, caller, stageId, op);
      if (answer.status >= 400) {
        const undo = await restoreAll(container, caller, stageId, checked, stageBefores, index);
        throw new ChangesetRefusal(422, "op_failed", `Op ${index + 1} failed on stage: ${messageOf(answer.body)}`, {
          op_index: index,
          op_status: answer.status,
          undo_failures: undo,
        });
      }
      answers.push({ op_index: index, status: answer.status, where: "stage" });
    } catch (error) {
      await refuseThrown(
        error,
        index,
        "on stage",
        () => restoreAll(container, caller, stageId, checked, stageBefores, stageBefores.length),
        "",
      );
    }
  }

  const updated = await service(container).updateAgentChangesets({
    id: changeset.id,
    status: "staged",
    stage_tenant_id: stageId,
    staged_at: new Date(),
    result: { ...(changeset.result ?? {}), stage_snapshot: stageBefores, stage_answers: answers },
  });
  return updated as unknown as ChangesetRow;
};

// ---- publish

export const publish = (container: MedusaContainer, caller: Caller, changeset: ChangesetRow): Promise<ChangesetRow> =>
  withChangesetLock(container, changeset.id, (fresh) => publishLocked(container, caller, fresh));

const publishLocked = async (
  container: MedusaContainer,
  caller: Caller,
  changeset: ChangesetRow,
): Promise<ChangesetRow> => {
  requireStatus(changeset, ["staged"], "published");
  const checked = checkOpsFor(caller, changeset.ops);
  const mainId = changeset.tenant_id;

  // Before anything is written: every op must have a way back. An op whose
  // target an earlier op of this changeset creates is read again right
  // before it runs, below.
  for (const [index, { op, rule }] of checked.entries()) {
    const spec = OP_SPECS[rule.kind];
    const madeEarlier = checked
      .slice(0, index)
      .some((earlier) => OP_SPECS[earlier.rule.kind].read(earlier.op) === spec.read(op));
    if (madeEarlier) continue;

    const before = await readValue(container, caller, mainId, op, rule);
    if (!spec.restore(op, before)) {
      throw new ChangesetRefusal(
        409,
        "no_rollback_path",
        `Op ${index + 1}: what it replaces on the live site cannot be written back, so it is not published.`,
        { op_index: index },
      );
    }
  }

  const befores: OpValue[] = [];
  for (const [index, { op, rule }] of checked.entries()) {
    try {
      befores.push(await readValue(container, caller, mainId, op, rule));
      const answer = await callAs(container, caller, mainId, op);
      if (answer.status >= 400) {
        const undo = await restoreAll(container, caller, mainId, checked, befores, index);
        throw new ChangesetRefusal(
          422,
          "op_failed",
          `Op ${index + 1} failed on the live site: ${messageOf(answer.body)}. Nothing stays published.`,
          { op_index: index, op_status: answer.status, undo_failures: undo },
        );
      }
    } catch (error) {
      await refuseThrown(
        error,
        index,
        "on the live site",
        () => restoreAll(container, caller, mainId, checked, befores, befores.length),
        " Nothing stays published.",
      );
    }
  }

  // Hashed after the last op, so two ops on one target agree on its value.
  const hashes: string[] = [];
  try {
    for (const { op, rule } of checked) {
      hashes.push(hashValue(await readValue(container, caller, mainId, op, rule)));
    }
  } catch (error) {
    await refuseThrown(
      error,
      checked.length - 1,
      "on the live site (final read)",
      () => restoreAll(container, caller, mainId, checked, befores, checked.length),
      " Nothing stays published.",
    );
  }

  const updated = await service(container).updateAgentChangesets({
    id: changeset.id,
    status: "published",
    snapshot: befores as unknown as Record<string, unknown>,
    published_hashes: hashes as unknown as Record<string, unknown>,
    published_at: new Date(),
  });
  return updated as unknown as ChangesetRow;
};

// ---- rollback

export type DriftEntry = {
  op_index: number;
  method: string;
  path: string;
  before: OpValue;
  now: OpValue;
};

/**
 * The targets of a published changeset that changed on the live site since:
 * what is there now against what a rollback would write. Empty when a
 * rollback can go ahead. The panel's card reads it too, so the owner sees the
 * drift before pressing «Откатить».
 */
export const driftOf = async (
  container: MedusaContainer,
  caller: Caller,
  changeset: ChangesetRow,
): Promise<DriftEntry[]> => {
  const checked = checkOpsFor(caller, changeset.ops);
  const befores = changeset.snapshot ?? [];
  const hashes = changeset.published_hashes ?? [];

  const drift: DriftEntry[] = [];
  for (const [index, { op, rule }] of checked.entries()) {
    const now = await readValue(container, caller, changeset.tenant_id, op, rule);
    if (hashValue(now) !== hashes[index]) {
      drift.push({ op_index: index, method: op.method, path: op.path, before: befores[index] ?? null, now });
    }
  }
  return drift;
};

export const rollback = (container: MedusaContainer, caller: Caller, changeset: ChangesetRow): Promise<ChangesetRow> =>
  withChangesetLock(container, changeset.id, (fresh) => rollbackLocked(container, caller, fresh));

const rollbackLocked = async (
  container: MedusaContainer,
  caller: Caller,
  changeset: ChangesetRow,
): Promise<ChangesetRow> => {
  requireStatus(changeset, ["published"], "rolled back");
  const checked = checkOpsFor(caller, changeset.ops);
  const mainId = changeset.tenant_id;
  const befores = changeset.snapshot ?? [];

  // Someone changed it since: the person sees what is there now against what
  // the rollback would write, and nothing is touched.
  const drift = await driftOf(container, caller, changeset);
  if (drift.length) {
    throw new ChangesetRefusal(
      409,
      "drift",
      "The live site changed after this was published. Nothing was rolled back.",
      { drift },
    );
  }

  const failures = await restoreAll(container, caller, mainId, checked, befores, checked.length);
  if (failures.length) {
    await service(container).updateAgentChangesets({
      id: changeset.id,
      result: { ...(changeset.result ?? {}), rollback_failures: failures },
    });
    throw new ChangesetRefusal(422, "rollback_failed", "Part of the rollback failed; see the ops named.", {
      failures,
    });
  }

  const updated = await service(container).updateAgentChangesets({
    id: changeset.id,
    status: "rolled_back",
    rolled_back_at: new Date(),
  });
  return updated as unknown as ChangesetRow;
};

// ---- discard

export const discard = (container: MedusaContainer, caller: Caller, changeset: ChangesetRow): Promise<ChangesetRow> =>
  withChangesetLock(container, changeset.id, (fresh) => discardLocked(container, caller, fresh));

const discardLocked = async (
  container: MedusaContainer,
  caller: Caller,
  changeset: ChangesetRow,
): Promise<ChangesetRow> => {
  requireStatus(changeset, ["draft", "staged"], "discarded");
  const checked = checkOpsFor(caller, changeset.ops);

  // A staged changeset already wrote the stage site: that is put back, so
  // stage shows the live site again plus whatever else is still staged.
  let failures: { op_index: number; status: number; message: string }[] = [];
  const stageBefores = changeset.result?.stage_snapshot;
  if (changeset.status === "staged" && changeset.stage_tenant_id && Array.isArray(stageBefores)) {
    // A product op's entry is null: it never ran on stage, and its restore
    // of nothing is nothing.
    failures = await restoreAll(
      container,
      caller,
      changeset.stage_tenant_id,
      checked,
      stageBefores as OpValue[],
      checked.length,
    );
  }

  const updated = await service(container).updateAgentChangesets({
    id: changeset.id,
    status: "discarded",
    discarded_at: new Date(),
    result: { ...(changeset.result ?? {}), ...(failures.length ? { discard_failures: failures } : {}) },
  });
  return updated as unknown as ChangesetRow;
};
