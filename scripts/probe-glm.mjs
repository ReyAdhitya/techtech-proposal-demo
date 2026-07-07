import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });
const CANDS = ["z-ai/glm-4.6","z-ai/glm-4.7","z-ai/glm-5"];
const schema = z.object({
  productName: z.string(), vendor: z.string(), price: z.number(),
  currency: z.string(), sourceUrl: z.string(),
});
const out = [];
await Promise.all(CANDS.map(async id=>{
  const t=Date.now();
  try{
    const {object}=await generateObject({
      model: openrouter(`${id}:online`), schema, maxRetries:1,
      prompt:"Search the web for a real store listing of a 'micro:bit v2 go kit' and return vendor, price and the exact product URL.",
    });
    out.push(`OK  ${id.padEnd(16)} ${Date.now()-t}ms  ${object.vendor} ${object.price}${object.currency} ${object.sourceUrl.slice(0,50)}`);
  }catch(e){ out.push(`ERR ${id.padEnd(16)} ${String(e.message).slice(0,70)}`); }
}));
out.forEach(l=>console.log(l));
