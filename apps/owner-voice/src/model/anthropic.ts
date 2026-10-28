/**
 * The Anthropic Messages API behind `ModelProvider`. Raw HTTPS, no SDK, like
 * the ElevenLabs client: one dependency less on the stand.
 */
import type { FetchFn } from "../shop/api.ts";
import type { ChatMessage, ModelProvider, ModelRequest, ModelStep, ToolCall } from "./types.ts";

const API_URL = "https://api.anthropic.com/v1/messages";
/** A model that does not answer in this time counts as failed, and the router answers instead. */
const TIMEOUT_MS = 30_000;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export function toAnthropicMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string | Block[] }[] {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.text };
    if (m.role === "tool") {
      return {
        role: "user",
        content: m.results.map((r): Block => ({ type: "tool_result", tool_use_id: r.id, content: r.content })),
      };
    }
    const blocks: Block[] = m.text ? [{ type: "text", text: m.text }] : [];
    for (const call of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
    return { role: "assistant", content: blocks.length ? blocks : m.text };
  });
}

export class AnthropicProvider implements ModelProvider {
  readonly name: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: FetchFn;

  constructor(apiKey: string, model: string, fetchFn: FetchFn = fetch) {
    this.#apiKey = apiKey;
    this.#model = model;
    this.#fetch = fetchFn;
    this.name = `anthropic ${model}`;
  }

  async next(request: ModelRequest): Promise<ModelStep> {
    const res = await this.#fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 700,
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic answered ${res.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await res.json()) as { content?: Block[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const blocks = body.content ?? [];
    const text = blocks
      .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const calls: ToolCall[] = blocks
      .filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }));
    const usage = { inputTokens: Number(body.usage?.input_tokens ?? 0), outputTokens: Number(body.usage?.output_tokens ?? 0) };
    return calls.length ? { kind: "tools", text, calls, usage } : { kind: "text", text, usage };
  }
}
