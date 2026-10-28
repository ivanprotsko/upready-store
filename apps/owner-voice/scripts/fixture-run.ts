/**
 * End to end on fixtures, with no key and no network: an audio file in, the
 * answer text and an audio file out.
 *
 *   node scripts/fixture-run.ts [audio.wav] [reply.wav]
 *
 * The environment is ignored on purpose, so a key that happens to be set does
 * not turn this into a paid live call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.ts";
import { describeConfig, readConfig } from "../src/config.ts";

const input = process.argv[2] ?? fileURLToPath(new URL("../fixtures/voice/question-sales-week.wav", import.meta.url));
const output = process.argv[3] ?? join(tmpdir(), "owner-voice-reply.wav");

const config = readConfig({ SHOP_FIXTURES: "1" });
const offline: typeof fetch = async (url) => {
  throw new Error(`fixture run: no network, refused ${String(url)}`);
};
const app = createApp(config, { fetch: offline });

const turn = await app.voice({ data: new Uint8Array(readFileSync(input)), contentType: "audio/wav" }, []);
if (turn.audio) writeFileSync(output, turn.audio.data);

console.log(
  JSON.stringify(
    {
      config: describeConfig(config),
      input,
      transcript: turn.transcript,
      calls: turn.calls,
      reply: turn.reply,
      audioOut: turn.audio ? { file: output, bytes: turn.audio.data.length, contentType: turn.audio.contentType } : null,
    },
    null,
    2,
  ),
);
