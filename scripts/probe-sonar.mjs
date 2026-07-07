import { readFileSync } from "node:fs";
import { generateText, generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });

// TEST 1: plain generateText with sonar-pro (native search)
console.log("TEST 1: generateText perplexity/sonar-pro (native search)");
try {
  const t=Date.now();
  const { text } = await generateText({
    model: openrouter("perplexity/sonar-pro"),
    prompt: "Find 2 real store listings with prices for a 'micro:bit v2 go kit'. List vendor, price, currency, URL.",
    maxRetries: 1,
  });
  console.log(`  OK ${Date.now()-t}ms, ${text.length} chars`);
  console.log("  preview:", text.slice(0,200).replace(/\n/g,' '));
} catch(e){ console.log("  ERR:", e.message); if(e.cause) console.log("  cause:", JSON.stringify(e.cause).slice(0,300)); }

// TEST 2: with :online suffix
console.log("\nTEST 2: generateText perplexity/sonar-pro:online");
try {
  const t=Date.now();
  const { text } = await generateText({
    model: openrouter("perplexity/sonar-pro:online"),
    prompt: "Find a real listing for a micro:bit v2 go kit.",
    maxRetries: 1,
  });
  console.log(`  OK ${Date.now()-t}ms, ${text.length} chars`);
} catch(e){ console.log("  ERR:", e.message); }
