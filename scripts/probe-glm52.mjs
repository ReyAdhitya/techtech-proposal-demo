import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });
const schema = z.object({
  materialsSubtotalHKD: z.number(), lecturerCostHKD: z.number(),
  tutorCostHKD: z.number(), totalCostHKD: z.number(), note: z.string(),
});
for (const id of ["z-ai/glm-5.2"]) {
  const t = Date.now();
  try {
    const { object } = await generateObject({
      model: openrouter(id), schema, temperature: 0, maxOutputTokens: 400, maxRetries: 0,
      prompt: "Compute HKD totals. materials: 8 kits x 2138.4. lecturers: 1 x 16 x 500. tutors: 2 x 16 x 300. total = materials+lecturers+tutors. note 'ok'.",
    });
    console.log(`OK ${id} ${Date.now()-t}ms ->`, JSON.stringify(object));
  } catch (e) { console.log(`ERR ${id}: ${String(e.message).slice(0,80)}`); }
}
