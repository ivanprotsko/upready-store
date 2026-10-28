/**
 * The command map as two agent tools: find a command, run one. A read runs,
 * a write only becomes a proposal (see `run.ts`), and what is not given to the
 * agent answers with the reason and a panel link.
 */
import type { Tool } from "../tools.ts";
import { COMMANDS, RISK_RU, searchCommands } from "./index.ts";
import { type CommandInput, runCommand } from "./run.ts";

const AGENT_RU = { read: "выполню", propose: "предложу, вы подтвердите", goto: "дам ссылку в панель", none: "не выдано" } as const;

const findCommands: Tool = {
  name: "find_commands",
  ports: [],
  description:
    "Найти команду панели магазина по словам: заказы, возвраты, товары, остатки, акции, баннеры, оплата. Возвращает id, что команда делает и можно ли её выполнить.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Что нужно сделать, например «список акций»" } },
    required: ["query"],
  },
  async run(input) {
    const query = typeof input.query === "string" ? input.query : "";
    const found = searchCommands(query).slice(0, 6);
    if (!found.length) return { text: `Команд по «${query}» нет.` };
    const rows = found.map((c) => `${c.id} — ${c.label_ru} (${RISK_RU[c.risk]}; ${AGENT_RU[c.agent]})`);
    return { text: rows.join("\n"), card: { title: `Команды: «${query}»`, rows } };
  },
};

const runCommandTool: Tool = {
  name: "run_command",
  ports: COMMANDS.filter((c) => c.agent === "read" || c.agent === "propose").map((c) => c.id),
  description:
    "Выполнить команду панели по её id. Чтение выполняется сразу. Изменение не выполняется: оно становится предложением, которое владелец подтверждает кнопкой, и на этом стенде подтверждение только показывает запрос.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "id команды из find_commands, например promotions.list" },
      product: { type: "string", description: "Название товара, если команда про один товар" },
      order: { type: "string", description: "Номер заказа, если команда про один заказ" },
      params: { type: "object", description: "Параметры пути по имени, например {\"id\": \"…\"}" },
      body: { type: "object", description: "Для изменения: тело запроса" },
    },
    required: ["id"],
  },
  async run(input, ctx) {
    const id = typeof input.id === "string" ? input.id : "";
    const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
    const args: CommandInput = {
      params: obj(input.params),
      body: obj(input.body),
      product: typeof input.product === "string" ? input.product : undefined,
      order: typeof input.order === "string" || typeof input.order === "number" ? input.order : undefined,
    };
    const { text, card } = await runCommand(id, args, ctx);
    return card ? { text, card } : { text };
  },
};

export const COMMAND_TOOLS: Tool[] = [findCommands, runCommandTool];
