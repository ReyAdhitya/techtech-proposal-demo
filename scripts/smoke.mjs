// Standalone runtime smoke test for the OpenRouter + AI SDK stack.
// Run: node scripts/smoke.mjs
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

// load OPENROUTER_API_KEY from .env.local
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no key");
const openrouter = createOpenRouter({ apiKey: key });

async function test(label, model, prompt, schema) {
  const t = Date.now();
  try {
    const { object } = await generateObject({ model: openrouter(model), schema, prompt });
    console.log(`✅ ${label} (${Date.now() - t}ms):`, JSON.stringify(object));
  } catch (e) {
    console.log(`❌ ${label}:`, e.message);
  }
}

// 1) structured output on a plain model → validates provider/SDK compatibility
await test(
  "structured-output",
  "openai/gpt-4o-mini",
  "Return the capital of France.",
  z.object({ capital: z.string() }),
);

// 2) live web search via :online → validates the sourcing agents will work
await test(
  "web-search",
  "openai/gpt-4o-mini:online",
  "Search the web for the official MatataLab Coding Set. Return its product name and the official store URL.",
  z.object({ productName: z.string(), url: z.string() }),
);
