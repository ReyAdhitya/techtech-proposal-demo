// Pure data (no server dependencies) so both the client UI and the server can
// import it. The ensemble assigns one distinct model per agent from this list.
// `nativeSearch` models already search the web on their own (no :online plugin).
export type PoolModel = {
  id: string;
  label: string;
  provider: string;
  nativeSearch?: boolean;
  /** Model searches great but is weak at structured output, so it researches in
   *  free text first, then a reliable model formats that into the schema. */
  twoStep?: boolean;
};

// Order matters: the UI seeds the default agents from the top of this list, and
// pickAgents() takes the first N. Healthy, structured-output-verified providers
// lead so a default run works out of the box. OpenAI + Google are kept available
// (they're excellent, especially Google for reading PDF/image attachments) but
// sit lower because they currently return a 403 "provider Terms of Service"
// error on this account until the OpenRouter data-policy setting is enabled
// (openrouter.ai/settings/privacy).
export const MODEL_POOL: PoolModel[] = [
  { id: "qwen/qwen3-max", label: "Qwen3 Max", provider: "Alibaba" },
  { id: "mistralai/mistral-large", label: "Mistral Large", provider: "Mistral" },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "Meta" },
  { id: "z-ai/glm-5.2", label: "GLM 5.2", provider: "Z.ai" },
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  {
    id: "perplexity/sonar-pro",
    label: "Sonar Pro · web search",
    provider: "Perplexity",
    nativeSearch: true,
    twoStep: true,
  },
];

export const MAX_AGENTS = MODEL_POOL.length;
