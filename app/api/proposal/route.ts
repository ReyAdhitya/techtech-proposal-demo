import { runPipeline, type PipelineInput } from "@/lib/agents";
import { LANGUAGES, type Language } from "@/lib/schemas";
import { MAX_AGENTS, hasApiKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 300; // N agents + web search + synthesis can take a while

// Attachment guards (mirror the client-side caps) so a huge base64 blob can't
// inflate the request or the vision prompt.
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_CHARS = 14_000_000; // ~10 MB decoded, base64-inflated

export async function POST(req: Request) {
  // Fail fast with a clear message instead of every model call dying with an
  // opaque 401 deep inside the stream.
  if (!hasApiKey) {
    return new Response(
      "Server is not configured: OPENROUTER_API_KEY is missing. Add it to .env.local and restart.",
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const attachments = Array.isArray(body.attachments)
    ? (body.attachments.filter(
        (s): s is string => typeof s === "string" && s.length <= MAX_ATTACHMENT_CHARS,
      ) as string[]).slice(0, MAX_ATTACHMENTS)
    : [];
  const agentCountRaw = Number(body.agentCount);
  const agentCount = Number.isFinite(agentCountRaw)
    ? Math.max(1, Math.min(Math.round(agentCountRaw), MAX_AGENTS))
    : MAX_AGENTS;
  const models = Array.isArray(body.models)
    ? (body.models.filter((s) => typeof s === "string" && s.trim()) as string[])
        .map((s) => s.trim())
        .slice(0, 12) // hard cap on agents per run
    : [];
  const posInt = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  };
  const nonNegInt = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };
  const lecturerCount = nonNegInt(body.lecturerCount);
  const lecturerRateHKD = posInt(body.lecturerRateHKD);
  const tutorCount = nonNegInt(body.tutorCount);
  const tutorRateHKD = posInt(body.tutorRateHKD);
  const language: Language = LANGUAGES.includes(body.language as Language)
    ? (body.language as Language)
    : "en";

  if (!email.trim() && attachments.length === 0) {
    return new Response(
      "Paste the organization's email and/or upload it as a PDF/image.",
      { status: 400 },
    );
  }

  const input: PipelineInput = {
    email,
    attachments,
    agentCount,
    models,
    language,
    lecturerCount,
    lecturerRateHKD,
    tutorCount,
    tutorRateHKD,
  };

  // Tie the pipeline to the request lifetime: if the client disconnects (or the
  // stream is cancelled), abort in-flight model calls instead of burning tokens
  // for up to maxDuration seconds.
  const ac = new AbortController();
  const onClientAbort = () => ac.abort(req.signal.reason);
  if (req.signal.aborted) ac.abort(req.signal.reason);
  else req.signal.addEventListener("abort", onClientAbort, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runPipeline(input, ac.signal)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "fatal",
                message: err instanceof Error ? err.message : String(err),
              }) + "\n",
            ),
          );
        }
      } finally {
        req.signal.removeEventListener("abort", onClientAbort);
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
