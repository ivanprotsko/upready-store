import { createHash } from "node:crypto";
import type {
  MarketplaceCredentialBag,
  MarketplaceWriteAuditRow,
  MarketplaceWriteConsent,
  MarketplaceWriteOpClass,
  MarketplaceWriteStore,
} from "../../marketplace-write/types";
import {
  answerTextSha256,
  planWbAnswerDispatch,
  WB_ANSWER_MAX_CHARS,
  type WbAnswerRow,
} from "../feedback-answers";
import { WB_UNREGISTERED_MUTATIONS, WB_WRITE_ENDPOINTS } from "../write-endpoints";
import { wbWrite, WB_WRITE_LIVE_ENV } from "../write-transport";

/**
 * The gates that stand in front of the write core's own five, for the class
 * «ответы на отзывы и вопросы» (w22-wb-write-feedback-answers).
 *
 * The five gates of w20 decide whether this SHOP may mutate this CLASS. They
 * never see a mirror row, so they cannot tell an answered review from an
 * unanswered one, or the text the owner confirmed from the text that is now
 * stored. That is what `planWbAnswerDispatch` decides, and every case below is
 * one sentence of the task's acceptance:
 *
 *   - отправить без черновика нельзя
 *   - подтверждение на КАЖДЫЙ ответ записано, и это сравнение, а не флажок
 *   - dry-run = ноль обращений к сети
 *   - на отвеченное второй раз не отвечают
 *
 * As in the w20 suite, `fetch` is a spy that throws in every case: no test
 * here may pass because a request quietly succeeded.
 */

const FEEDBACK: WbAnswerRow = {
  id: "wbfb_01",
  wb_id: "kSDFgh34kjHG",
  is_answered: false,
  was_viewed: null,
  draft_answer: "Спасибо за отзыв! Рады, что подошло.",
  answer_status: "draft",
};

const QUESTION: WbAnswerRow = {
  id: "wbq_01",
  wb_id: "n5um6IUBQOOSTxXoo0gV",
  is_answered: false,
  was_viewed: false,
  draft_answer: "Состав указан на бирке.",
  answer_status: "draft",
};

const shaOf = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("planWbAnswerDispatch — the per-answer gates", () => {
  it("refuses to send a review answer that was never written", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: { ...FEEDBACK, draft_answer: null },
      confirmedSha256: shaOf(""),
    });

    expect(plan.ok).toBe(false);
    expect(plan.ok === false && plan.refusal).toBe("no_draft");
  });

  it("treats a whitespace-only draft as no draft", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: { ...FEEDBACK, draft_answer: "   \n  " },
      confirmedSha256: shaOf("   \n  "),
    });

    expect(plan.ok === false && plan.refusal).toBe("no_draft");
  });

  it("refuses a draft longer than the bound WB documents", () => {
    const long = "я".repeat(WB_ANSWER_MAX_CHARS + 1);
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: { ...FEEDBACK, draft_answer: long },
      confirmedSha256: shaOf(long),
    });

    expect(plan.ok === false && plan.refusal).toBe("text_too_long");
  });

  it("refuses a send with no confirmation at all", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: FEEDBACK,
      confirmedSha256: null,
    });

    expect(plan.ok === false && plan.refusal).toBe("confirmation_missing");
  });

  it("refuses when the stored draft is not the text that was confirmed", () => {
    // The dialog quoted one text; the draft changed in another tab afterwards.
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: { ...FEEDBACK, draft_answer: "Совсем другой ответ." },
      confirmedSha256: shaOf(FEEDBACK.draft_answer as string),
    });

    expect(plan.ok === false && plan.refusal).toBe("confirmation_mismatch");
  });

  it("builds the documented body when the confirmation matches the draft", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: FEEDBACK,
      confirmedSha256: shaOf(FEEDBACK.draft_answer as string),
    });

    expect(plan).toEqual({
      ok: true,
      endpointId: "wb.feedbacks.answer",
      body: { id: FEEDBACK.wb_id, text: FEEDBACK.draft_answer },
      textSha256: shaOf(FEEDBACK.draft_answer as string),
    });
  });

  it("hashes the TEXT and not the request body, so the panel can compute it", () => {
    // The panel hashes what it shows in the dialog. If these two ever drifted,
    // every confirmation would fail and the screen would blame the owner.
    expect(answerTextSha256("Спасибо за отзыв!")).toBe(shaOf("Спасибо за отзыв!"));
  });

  it("refuses a review WB has already answered", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: { ...FEEDBACK, is_answered: true },
      confirmedSha256: shaOf(FEEDBACK.draft_answer as string),
    });

    expect(plan.ok === false && plan.refusal).toBe("already_answered");
  });

  it("refuses a review this panel has already sent", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: { ...FEEDBACK, answer_status: "sent" },
      confirmedSha256: shaOf(FEEDBACK.draft_answer as string),
    });

    expect(plan.ok === false && plan.refusal).toBe("already_sent");
  });

  it("refuses to answer a QUESTION, and says it is a documentation gap", () => {
    const plan = planWbAnswerDispatch({
      target: "question",
      intent: "answer",
      row: QUESTION,
      confirmedSha256: shaOf(QUESTION.draft_answer as string),
    });

    expect(plan.ok === false && plan.refusal).toBe("unregistered_mutation");
    expect(plan.ok === false && plan.message).toBe(WB_UNREGISTERED_MUTATIONS[0].reason);
    // And the mutation really is absent from the registry, so no branch of the
    // route could reach it even if this gate were removed.
    expect(WB_WRITE_ENDPOINTS.some((entry) => entry.id === "wb.questions.answer")).toBe(false);
  });

  it("builds the documented ViewQuestion body for «отметить просмотренным»", () => {
    const plan = planWbAnswerDispatch({
      target: "question",
      intent: "view",
      row: QUESTION,
    });

    expect(plan).toEqual({
      ok: true,
      endpointId: "wb.questions.view",
      body: { id: QUESTION.wb_id, wasViewed: true },
      textSha256: null,
    });
  });

  it("refuses «отметить просмотренным» for a question WB already marked viewed", () => {
    const plan = planWbAnswerDispatch({
      target: "question",
      intent: "view",
      row: { ...QUESTION, was_viewed: true },
    });

    expect(plan.ok === false && plan.refusal).toBe("already_viewed");
  });

  it("refuses «отметить просмотренным» for a review, which WB does not document", () => {
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "view",
      row: FEEDBACK,
    });

    expect(plan.ok === false && plan.refusal).toBe("not_applicable");
  });
});

/**
 * The dispatch half: what a plan that says `ok` produces when it is handed to
 * the write core with every gate but the live one open.
 */
const token = (payload: Record<string, unknown>): string => {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.${body}.test-signature`;
};

const WRITE_KEY = token({
  id: "w22-write",
  sid: "seller-1",
  acc: 3,
  s: 0b10010,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const CONSENT: MarketplaceWriteConsent = {
  op_class: "feedback_answers",
  confirmed_by: "tenant-admin-1",
  confirmed_at: new Date("2026-09-16T00:00:00.000Z"),
  note: "Ответы на отзывы и вопросы покупателей",
};

const harness = (options: { consent?: MarketplaceWriteConsent | null } = {}) => {
  const audit: MarketplaceWriteAuditRow[] = [];
  const credentials: Record<string, MarketplaceCredentialBag> = {
    wildberries_write: { api_key: WRITE_KEY },
  };

  const store: MarketplaceWriteStore = {
    readCredential: async (slot: string) => credentials[slot] ?? null,
    isEnabled: async () => true,
    findConsent: async (opClass: MarketplaceWriteOpClass) => {
      const consent = options.consent === undefined ? CONSENT : options.consent;
      return consent && consent.op_class === opClass ? consent : null;
    },
    appendAudit: async (row) => {
      audit.push(row);
    },
  };

  return { store, audit };
};

describe("dispatching a confirmed answer through the write core", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(() => {
      throw new Error("A test opened a socket. No write test may reach the network.");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env[WB_WRITE_LIVE_ENV];
  });

  it("answers a review as a DRY RUN: zero fetches, one audit row, nothing sent", async () => {
    const h = harness();
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: FEEDBACK,
      confirmedSha256: shaOf(FEEDBACK.draft_answer as string),
    });

    if (!plan.ok) {
      throw new Error(`the plan was refused: ${plan.message}`);
    }

    const result = await wbWrite(
      plan.endpointId,
      { body: plan.body },
      {
        tenantId: "ten_w22",
        actor: "tenant-admin-1",
        store: h.store,
        env: {},
        logger: { info: jest.fn(), warn: jest.fn() },
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.status).toBeNull();
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      op_class: "feedback_answers",
      endpoint_id: "wb.feedbacks.answer",
      method: "POST",
      path: "/api/v1/feedbacks/answer",
      dry_run: true,
      outcome: "dry_run",
      // The per-answer confirmation reaches the journal as the ACTOR who
      // pressed it; the text is fingerprinted by `payload_sha256`.
      actor: "tenant-admin-1",
    });
  });

  it("marks a question viewed as a DRY RUN too", async () => {
    const h = harness();
    const plan = planWbAnswerDispatch({ target: "question", intent: "view", row: QUESTION });

    if (!plan.ok) {
      throw new Error(`the plan was refused: ${plan.message}`);
    }

    const result = await wbWrite(
      plan.endpointId,
      { body: plan.body },
      {
        tenantId: "ten_w22",
        actor: "tenant-admin-1",
        store: h.store,
        env: {},
        logger: { info: jest.fn(), warn: jest.fn() },
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(h.audit[0]).toMatchObject({
      endpoint_id: "wb.questions.view",
      method: "PATCH",
      path: "/api/v1/questions",
      outcome: "dry_run",
    });
  });

  it("is refused at the consent gate when the class was never confirmed", async () => {
    const h = harness({ consent: null });
    const plan = planWbAnswerDispatch({
      target: "feedback",
      intent: "answer",
      row: FEEDBACK,
      confirmedSha256: shaOf(FEEDBACK.draft_answer as string),
    });

    if (!plan.ok) {
      throw new Error(`the plan was refused: ${plan.message}`);
    }

    await expect(
      wbWrite(
        plan.endpointId,
        { body: plan.body },
        {
          tenantId: "ten_w22",
          actor: "tenant-admin-1",
          store: h.store,
          env: {},
          logger: { info: jest.fn(), warn: jest.fn() },
        },
      ),
    ).rejects.toMatchObject({ gate: "consent" });

    // The per-answer confirmation does NOT stand in for the class consent:
    // both are required, and this is the case that proves it.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.audit[0]).toMatchObject({ outcome: "refused", gate: "consent" });
  });
});

describe("the registry entries this class needs", () => {
  it("registers the documented question mutation and validates its body", () => {
    const entry = WB_WRITE_ENDPOINTS.find((candidate) => candidate.id === "wb.questions.view");

    expect(entry).toBeDefined();
    expect(entry?.method).toBe("PATCH");
    expect(entry?.host).toBe("feedbacks-api.wildberries.ru");
    expect(entry?.path).toBe("/api/v1/questions");
    expect(entry?.opClass).toBe("feedback_answers");
    // Verbatim from the saved documentation sample.
    expect(entry?.bodySchema.safeParse({ id: "n5um6IUBQOOSTxXoo0gV", wasViewed: true }).success).toBe(
      true,
    );
    // A body with the answer fields somebody might expect is REFUSED, because
    // that variant is not what this entry registers.
    expect(entry?.bodySchema.safeParse({ id: "x", answer: { text: "hi" } }).success).toBe(false);
  });

  it("names the unanswerable mutation, with its documentation page", () => {
    const gap = WB_UNREGISTERED_MUTATIONS.find((entry) => entry.what === "questions.answer");

    expect(gap).toBeDefined();
    expect(gap?.opClass).toBe("feedback_answers");
    expect(gap?.docUrl).toContain("customer-communication");
    expect(gap?.reason.length).toBeGreaterThan(40);
  });
});
