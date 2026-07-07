import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { MODEL_POOL, MAX_AGENTS, type PoolModel } from "./pool";

export { MODEL_POOL, MAX_AGENTS };

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.warn(
    "[openrouter] OPENROUTER_API_KEY is not set. Add it to .env.local before running the pipeline.",
  );
}

export const openrouter = createOpenRouter({ apiKey: apiKey ?? "" });

/** True when a real API key is configured. The route uses this to fail fast with
 *  a clear message instead of every model call dying with an opaque 401. */
export const hasApiKey = Boolean(apiKey && apiKey.trim());

// The ensemble pool lives in ./pool (server-dependency-free so the UI can import
// it too). Each agent the user requests is assigned a DIFFERENT model from that
// list — this is the whole point of "N agents": different models / reasoning
// approaches generate different ideas, then we synthesise the best. The agents
// are NOT given different roles; every one performs the same full task alone.
// Every id there is verified on this account for structured output + :online.

/** Vision-capable models that read the pasted email + any PDF/image attachments.
 *  Tried in order, so a provider outage on the first choice doesn't kill intake.
 *  Google/OpenAI lead because they read attachments best; the healthy text models
 *  at the end still extract a proper structured object from a PASTED email when
 *  the vision providers are unavailable (a 403 fails instantly, so the fallthrough
 *  is fast). Attachment-only intake still needs the vision providers. */
export const EXTRACTION_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4o",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat-v3-0324",
  "qwen/qwen3-max",
];

/** First-choice extraction model (kept for back-compat / display). */
export const EXTRACTION_MODEL = EXTRACTION_MODELS[0];

/** Strong, reliable models that merge all agents into the final proposal.
 *  Tried in order; if all fail we degrade to a single agent's proposal. Healthy
 *  providers lead so synthesis works while OpenAI/Google are blocked; those two
 *  remain as later fallbacks for when the account data policy is enabled. */
// Mistral Large leads: it is fast and reliable at large structured output.
// (Qwen3 Max is a fine ensemble agent but too slow generating the big merged
// proposal — it hit the 120s synthesis timeout in testing — so it sits lower.)
export const SYNTHESIS_MODELS = [
  "mistralai/mistral-large",
  "deepseek/deepseek-chat-v3-0324",
  "qwen/qwen3-max",
  "openai/gpt-4o",
  "google/gemini-2.5-pro",
];

/** First-choice synthesis model (kept for back-compat / display). */
export const SYNTHESIS_MODEL = SYNTHESIS_MODELS[0];

/** Models that verify the final budget arithmetic. GLM 5.2 leads (accurate at
 *  the counting and far cheaper than a frontier model, which matters for cost);
 *  Gemini 2.5 Flash is a cheap fallback. Used with a small token cap, and the
 *  step degrades to code-only maths if neither model is available. */
export const BUDGET_MODELS = [
  "z-ai/glm-5.2",
  "deepseek/deepseek-chat-v3-0324",
  "google/gemini-2.5-flash",
];

/** Append :online to turn on OpenRouter's live web-search plugin for a call. */
export const online = (id: string) => openrouter(`${id}:online`);

/** Pick the models for an N-agent run (N is clamped to the pool size). */
export function pickAgents(count: number) {
  const n = Math.max(1, Math.min(count, MODEL_POOL.length));
  return MODEL_POOL.slice(0, n);
}

/** Build an agent descriptor for a model id that isn't in the curated pool
 *  (a custom OpenRouter alias the user typed). Provider/label are derived from
 *  the id, and Perplexity/Sonar models get the two-step search treatment. */
function describeModel(id: string): PoolModel {
  const slash = id.indexOf("/");
  const providerRaw = slash > 0 ? id.slice(0, slash) : "custom";
  const name = slash > 0 ? id.slice(slash + 1) : id;
  const provider = providerRaw
    ? providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1)
    : "Custom";
  const isSonar = /(^|\/)perplexity\//i.test(id) || /sonar/i.test(id);
  return {
    id,
    label: name || id,
    provider,
    nativeSearch: isSonar || undefined,
    twoStep: isSonar || undefined,
  };
}

/** Resolve the user's chosen model ids into agent descriptors, IN ORDER and
 *  allowing custom (non-pool) ids and duplicates. Curated ids keep their rich
 *  metadata; anything else is described from the id itself. */
export function selectAgents(ids: string[]) {
  const byId = new Map(MODEL_POOL.map((m) => [m.id, m]));
  const picked = ids
    .map((id) => (id || "").trim())
    .filter(Boolean)
    .map((id) => byId.get(id) ?? describeModel(id));
  return picked.length ? picked : MODEL_POOL.slice(0, Math.min(3, MODEL_POOL.length));
}
