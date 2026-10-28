/**
 * One turn of the owner chat: the question in, tool calls through the
 * provider, the short spoken answer out.
 */
import type { ChatMessage, ModelProvider } from "./model/types.ts";
import { type Card, type ToolContext, type ToolOutcome, type ToolSpec, runTool, toolSpecs } from "./tools.ts";

/** A model that keeps calling tools gets this many rounds, then answers with what it has. */
const MAX_ROUNDS = 4;

export function systemPrompt(shopName: string): string {
  return [
    `Ты голосовой помощник владельца интернет-магазина «${shopName}».`,
    "Отвечай по-русски, коротко, 1–3 предложения: ответ будет озвучен.",
    "Цифры бери только из инструментов, не считай деньги сам и не придумывай данных.",
    "Округляй суммы до целых, без markdown, списков и эмодзи.",
    "Данные ты только читаешь. Изменение ты не выполняешь, а предлагаешь через run_command: владелец подтверждает его кнопкой.",
    "Удаление, отмену, возврат денег и другие необратимые действия ты не делаешь и не предлагаешь: они в панели.",
    "Чего нет среди готовых инструментов, ищи командой find_commands.",
    "Если инструмент вернул ошибку, скажи, что данные сейчас недоступны.",
  ].join("\n");
}

export interface TurnResult {
  reply: string;
  cards: Card[];
  calls: { name: string; input: Record<string, unknown> }[];
}

/** The prompt and tools of one chat; the owner's by default, the buyer assistant passes its own. */
export interface ToolKit<C> {
  system: string;
  specs: () => ToolSpec[];
  run: (name: string, input: Record<string, unknown>, ctx: C) => Promise<ToolOutcome>;
}

export async function runTurn<C = ToolContext>(
  provider: ModelProvider,
  ctx: C,
  shopName: string,
  history: ChatMessage[],
  question: string,
  kit?: ToolKit<C>,
): Promise<TurnResult> {
  const messages: ChatMessage[] = [...history, { role: "user", text: question }];
  const cards: Card[] = [];
  const calls: TurnResult["calls"] = [];
  const tools = kit ?? ({ system: systemPrompt(shopName), specs: toolSpecs, run: runTool } as unknown as ToolKit<C>);
  const request = () => ({ system: tools.system, messages, tools: tools.specs() });

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const step = await provider.next(request());
    if (step.kind === "text") return { reply: step.text, cards, calls };
    messages.push({ role: "assistant", text: step.text, toolCalls: step.calls });
    const results = [];
    for (const call of step.calls) {
      const outcome = await tools.run(call.name, call.input, ctx);
      calls.push({ name: call.name, input: call.input });
      if (outcome.card) cards.push(outcome.card);
      results.push({ id: call.id, name: call.name, content: outcome.text });
    }
    messages.push({ role: "tool", results });
  }
  return { reply: "Не успел собрать ответ, спросите короче.", cards, calls };
}
