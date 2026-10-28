/**
 * The one interface every model sits behind.
 *
 * The chat never talks to a vendor's API directly: it hands a provider the
 * conversation and the tool specs and gets back either tool calls or the final
 * text. So the RU shop can swap in a Russian model (YandexGPT, GigaChat) by
 * adding one file next to `anthropic.ts` and nothing else changes. The
 * provider sees only tool results, never a database: the data reaches it
 * through the shop's HTTP API (Ivan, 20.10.2026).
 */
import type { ToolSpec } from "../tools.ts";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  content: string;
}

export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

/** Tokens a paid model reports for one call, for the daily spend cap. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type ModelStep = ({ kind: "tools"; text: string; calls: ToolCall[] } | { kind: "text"; text: string }) & { usage?: Usage };

export interface ModelRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
}

export interface ModelProvider {
  /** Shown on the stand and in the report, e.g. "anthropic claude-sonnet-5-5". */
  readonly name: string;
  next(request: ModelRequest): Promise<ModelStep>;
}
