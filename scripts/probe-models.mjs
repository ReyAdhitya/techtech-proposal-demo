// Probes a pool of candidate models for structured-output support on THIS
// OpenRouter account, so the app only ever assigns models that actually work.
// Run: node scripts/probe-models.mjs
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });

const CANDIDATES = [
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.7-sonnet",
  "anthropic/claude-sonnet-4",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-chat-v3-0324",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-large",
  "x-ai/grok-2-1212",
  "qwen/qwen-2.5-72b-instruct",
  "qwen/qwen3-max",
];

const schema = z.object({
  city: z.string(),
  population: z.number(),
});

const results = [];
await Promise.all(
  CANDIDATES.map(async (model) => {
    const t = Date.now();
    try {
      const { object } = await generateObject({
        model: openrouter(model),
        schema,
        prompt: "Name the capital of Japan and its approximate population.",
      });
      results.push({ model, ok: true, ms: Date.now() - t, sample: JSON.stringify(object) });
    } catch (e) {
      results.push({ model, ok: false, err: e.message.slice(0, 80) });
    }
  }),
);

results.sort((a, b) => Number(b.ok) - Number(a.ok));
for (const r of results) {
  console.log(r.ok ? `✅ ${r.model.padEnd(38)} ${r.ms}ms ${r.sample}` : `❌ ${r.model.padEnd(38)} ${r.err}`);
}
console.log(`\nWORKING: ${results.filter((r) => r.ok).map((r) => r.model).join(", ")}`);
