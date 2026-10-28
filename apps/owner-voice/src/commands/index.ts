/**
 * The owner's command map: the 121 commands of the chrxnasdmds admin-actions
 * map, each pointed at one target in this repo.
 *
 *   - `route`: a shop panel API route, `/tenants/*`, with the file and line
 *     of the backend handler that answers it;
 *   - `page`: a tenant-panel page, opened as a link;
 *   - `missing`: neither exists yet, with the reason in a few words.
 *
 * The data is `commands.json` next to this file and nothing here reaches the
 * network, so the map and its search move as they are to another app.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Risk = "safe" | "write" | "destructive" | "financial";
/** read: the agent runs it; propose: the agent drafts it for the owner to confirm; goto: a panel link only; none: not given. */
export type AgentUse = "read" | "propose" | "goto" | "none";

export type Target =
  | { kind: "route"; method: string; path: string; file: string; line: number }
  | { kind: "page"; path: string; file: string; line: number }
  | { kind: "missing"; reason: string };

export interface Command {
  id: string;
  label_ru: string;
  label_en: string;
  aliases: string[];
  section: string;
  section_ru: string;
  /** Where the command lived in chrxnasdmds, the Medusa Admin API. */
  admin: { method: string; path: string };
  scope: "read" | "write";
  risk: Risk;
  /** The row was marked «платный API» in chrxnasdmds. */
  paid?: boolean;
  agent: AgentUse;
  target: Target;
  /** A tenant-panel page for «go to», with `{param}` placeholders; null when the panel has none. */
  panel: string | null;
  /** The body a proposal starts from. */
  body?: Record<string, unknown>;
  note?: string;
}

const FILE = fileURLToPath(new URL("./commands.json", import.meta.url));

export const COMMANDS: Command[] = (JSON.parse(readFileSync(FILE, "utf8")) as { commands: Command[] }).commands;

export const commandById = (id: string): Command | undefined => COMMANDS.find((c) => c.id === id);

/** The words the badges say, after chrxnasdmds `RISK_LABEL`. */
export const RISK_RU: Record<Risk, string> = { safe: "чтение", write: "запись", destructive: "необратимо", financial: "деньги" };

/** `{id}` and the like in a path, in order. */
export const pathParams = (path: string): string[] => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

/** A path with its parameters filled in, each one URL-encoded; null while one is missing. */
export function fillPath(path: string, params: Record<string, unknown>): string | null {
  let missing = false;
  const filled = path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (typeof value !== "string" || !value.trim()) {
      missing = true;
      return "";
    }
    return encodeURIComponent(value.trim());
  });
  return missing ? null : filled;
}

/** The panel link for «go to»: the page with its parameters, or the page's list when a parameter is not known. */
export function panelHref(command: Command, panelUrl: string, params: Record<string, unknown> = {}): string | null {
  if (!command.panel) return null;
  const filled = fillPath(command.panel, params);
  if (filled) return `${panelUrl}${filled}`;
  const base = command.panel.split("/{")[0];
  return base ? `${panelUrl}${base}` : null;
}

/** The list a parameter is picked from: `/tenants/products` for `/tenants/products/{id}`. */
export function pickList(command: Command): string | null {
  if (command.target.kind !== "route") return null;
  const [first] = pathParams(command.target.path);
  if (!first) return null;
  const list = command.target.path.slice(0, command.target.path.indexOf(`/{${first}}`));
  return COMMANDS.some((c) => c.target.kind === "route" && c.target.method === "GET" && c.target.path === list) ? list : null;
}

const fold = (text: string): string => text.toLowerCase().replace(/ё/g, "е");
const words = (text: string): string[] => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Commands that match every word of the query, best first. A word matches by
 * its first five letters, so «заказов» finds «заказ» and «товары» finds
 * «товар». An alias or a name that starts with the whole query ranks first.
 */
export function searchCommands(query: string, list: Command[] = COMMANDS): Command[] {
  const q = words(query);
  if (!q.length) return [...list];
  const whole = q.join(" ");
  const scored: { command: Command; score: number }[] = [];
  for (const command of list) {
    const names = [command.label_ru, command.label_en, ...command.aliases];
    const hay = words([...names, command.id.replace(/[._]/g, " "), command.section_ru, command.section].join(" "));
    const hit = q.every((w) => hay.some((h) => h.startsWith(w.slice(0, 5)) || (w.length < 5 && h.startsWith(w))));
    if (!hit) continue;
    let score = 1;
    for (const name of names) {
      const n = words(name).join(" ");
      if (n === whole) score = Math.max(score, 4);
      else if (n.startsWith(whole)) score = Math.max(score, 3);
    }
    if (command.agent === "read") score += 0.5;
    scored.push({ command, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.command);
}

/**
 * The command a spoken or typed phrase names: the longest alias whose every
 * word is in the phrase. Only commands the agent may use count.
 */
export function commandForPhrase(phrase: string, uses: AgentUse[] = ["read"]): Command | null {
  const said = words(phrase);
  let best: { command: Command; length: number } | null = null;
  for (const command of COMMANDS) {
    if (!uses.includes(command.agent)) continue;
    for (const alias of command.aliases) {
      const aw = words(alias);
      const hit = aw.every((w) => said.some((s) => s.slice(0, 5) === w.slice(0, 5) || (w.length < 5 && s === w)));
      if (hit && (!best || alias.length > best.length)) best = { command, length: alias.length };
    }
  }
  return best?.command ?? null;
}

const csvCell = (value: unknown): string => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The full table, one row per command, for the report. */
export function commandsCsv(list: Command[] = COMMANDS): string {
  const head = ["id", "label_ru", "label_en", "section", "risk", "agent", "target", "method", "path", "file_line", "panel", "reason", "aliases"];
  const rows = list.map((c) => [
    c.id,
    c.label_ru,
    c.label_en,
    c.section_ru,
    c.risk,
    c.agent,
    c.target.kind,
    c.target.kind === "route" ? c.target.method : "",
    c.target.kind === "missing" ? c.admin.path : c.target.path,
    c.target.kind === "missing" ? "" : `${c.target.file}:${c.target.line}`,
    c.panel ?? "",
    c.target.kind === "missing" ? c.target.reason : (c.note ?? ""),
    c.aliases.join(" | "),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
