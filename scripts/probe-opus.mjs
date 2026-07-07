import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });
const CANDS = [
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-4.1",
  "anthropic/claude-opus-4",
  "anthropic/claude-sonnet-4.5",
];
const schema = z.object({
  total: z.number(),
  items: z.array(z.object({ name: z.string(), qty: z.number(), unitHKD: z.number(), lineHKD: z.number() })),
});
const out = [];
await Promise.all(CANDS.map(async (id) => {
  const t = Date.now();
  try {
    const { object } = await generateObject({
      model: openrouter(id), schema, maxRetries: 0,
      prompt: "Compute: 8 kits at 2138.4 HKD each, 24 iPads at 0 (owned). Return line totals and the grand total, all in HKD.",
    });
    out.push(`OK  ${id.padEnd(30)} ${Date.now()-t}ms total=${object.total}`);
  } catch (e) { out.push(`ERR ${id.padEnd(30)} ${String(e.message).slice(0,60)}`); }
}));
out.sort();
out.forEach((l) => console.log(l));
