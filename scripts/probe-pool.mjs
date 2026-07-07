import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });

// Schema close in complexity to the real AgentProposalSchema
const schema = z.object({
  courseOutline: z.string(),
  lessons: z.array(z.object({ lessonNumber: z.number(), title: z.string(), objectives: z.array(z.string()), activities: z.array(z.string()) })),
  materials: z.array(z.object({
    name: z.string(), purpose: z.string(), quantity: z.number(),
    sources: z.array(z.object({ vendor: z.string(), unitPrice: z.number(), currency: z.string(), url: z.string() })),
    recommendedVendor: z.string(), priceReasoning: z.string(),
  })),
  estimatedMaterialCostHKD: z.number(),
  staffing: z.object({ tutorsNeeded: z.number(), rationale: z.string() }),
  reasoning: z.string(), summary: z.string(),
});

const CANDS = ["openai/gpt-4.1","google/gemini-2.5-pro","meta-llama/llama-3.3-70b-instruct","mistralai/mistral-large","qwen/qwen3-max","z-ai/glm-4.6"];
const out=[];
await Promise.all(CANDS.map(async id=>{
  const t=Date.now();
  try{
    await generateObject({ model: openrouter(`${id}:online`), schema, maxRetries:1,
      prompt:"Design a short 3-lesson robotics course for kindergarten and web-search 2 material listings each. Fill every field." });
    out.push(`OK  ${id.padEnd(34)} ${Date.now()-t}ms`);
  }catch(e){ out.push(`ERR ${id.padEnd(34)} ${String(e.message).slice(0,55)}`); }
}));
out.sort();
out.forEach(l=>console.log(l));
