// Find the best "search" model: which returns a REAL, resolvable listing URL.
// Run: node scripts/probe-search.mjs
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });

// Candidate search-capable models. Perplexity Sonar searches natively (no :online
// needed); the others use OpenRouter's :online plugin.
const CANDIDATES = [
  { id: "perplexity/sonar", online: false },
  { id: "perplexity/sonar-pro", online: false },
  { id: "perplexity/sonar-reasoning", online: false },
  { id: "openai/gpt-4o:online", online: true },
  { id: "google/gemini-2.5-flash:online", online: true },
];

const schema = z.object({
  productName: z.string(),
  vendor: z.string(),
  price: z.number(),
  currency: z.string(),
  sourceUrl: z.string(),
});

async function urlResolves(url) {
  if (!url || !/^https?:\/\//.test(url)) return "no-url";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal }).catch(
      () => null,
    );
    // Some stores block HEAD — retry with GET.
    if (!res || res.status >= 400) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal }).catch(
        () => null,
      );
    }
    clearTimeout(t);
    if (!res) return "unreachable";
    return `${res.status}`;
  } catch {
    return "error";
  }
}

const results = [];
await Promise.all(
  CANDIDATES.map(async (c) => {
    const t = Date.now();
    try {
      const { object } = await generateObject({
        model: openrouter(c.id),
        schema,
        prompt:
          "Search the web for a real store listing of a 'micro:bit v2 go kit' and return the " +
          "exact product page URL, vendor and price. The URL must be a real, working listing.",
      });
      const status = await urlResolves(object.sourceUrl);
      results.push({
        id: c.id,
        ok: true,
        ms: Date.now() - t,
        url: object.sourceUrl,
        status,
      });
    } catch (e) {
      results.push({ id: c.id, ok: false, err: e.message.slice(0, 80) });
    }
  }),
);

results.sort((a, b) => Number(b.ok) - Number(a.ok));
for (const r of results) {
  if (r.ok) {
    const good = r.status === "200" || r.status === "no-url" ? "" : "  ⚠";
    console.log(`✅ ${r.id.padEnd(34)} ${r.ms}ms  link=${r.status}${good}  ${r.url}`);
  } else {
    console.log(`❌ ${r.id.padEnd(34)} ${r.err}`);
  }
}
