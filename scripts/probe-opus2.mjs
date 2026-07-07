import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });
const schema = z.object({ grandTotalHKD: z.number(), note: z.string() });
for (const [id, mx] of [["anthropic/claude-opus-4.8", 400],["anthropic/claude-opus-4.8", 1500],["anthropic/claude-sonnet-4.5", 800]]) {
  const t = Date.now();
  try {
    const { object } = await generateObject({
      model: openrouter(id), schema, maxRetries: 0, maxOutputTokens: mx,
      prompt: "8 kits x 2138.4 HKD + 6 mats x 120 HKD. Grand total in HKD?",
    });
    console.log(`OK  ${id} maxTok=${mx} ${Date.now()-t}ms -> ${object.grandTotalHKD}`);
  } catch (e) { console.log(`ERR ${id} maxTok=${mx}: ${String(e.message).slice(0,70)}`); }
}
