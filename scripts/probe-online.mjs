// Confirms structured-output + live web search (:online) work together for
// every model we intend to put in the ensemble pool.
// Run: node scripts/probe-online.mjs
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });

const POOL = [
  "openai/gpt-4o",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat-v3-0324",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-large",
  "qwen/qwen3-max",
  "openai/gpt-4.1",
  "google/gemini-2.5-flash",
];

const schema = z.object({
  found: z.boolean(),
  productName: z.string(),
  approxPriceUSD: z.number(),
  sourceUrl: z.string(),
});

const results = [];
await Promise.all(
  POOL.map(async (id) => {
    const t = Date.now();
    try {
      const { object } = await generateObject({
        model: openrouter(`${id}:online`),
        schema,
        prompt:
          "Search the web for the price of a 'micro:bit v2 go' kit and return a real listing.",
      });
      results.push({ id, ok: true, ms: Date.now() - t, sample: JSON.stringify(object).slice(0, 90) });
    } catch (e) {
      results.push({ id, ok: false, err: e.message.slice(0, 90) });
    }
  }),
);

results.sort((a, b) => Number(b.ok) - Number(a.ok));
for (const r of results) {
  console.log(r.ok ? `✅ ${r.id.padEnd(38)} ${r.ms}ms ${r.sample}` : `❌ ${r.id.padEnd(38)} ${r.err}`);
}
console.log(`\nONLINE-OK: ${results.filter((r) => r.ok).map((r) => r.id).join(", ")}`);
