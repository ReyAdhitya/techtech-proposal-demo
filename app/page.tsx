"use client";

import { useEffect, useMemo, useState } from "react";
import { MODEL_POOL } from "@/lib/pool";
import type {
  Requirements,
  AgentProposal,
  FinalProposal,
  Language,
} from "@/lib/schemas";

type StageStatus = "idle" | "start" | "done" | "error";
type AgentState = {
  index: number;
  model: string;
  label: string;
  provider: string;
  status: StageStatus;
  detail?: string;
};
type AgentRun = {
  index: number;
  model: string;
  label: string;
  provider: string;
  proposal: AgentProposal;
};
type CostSpread = { model: string; label: string; estHKD: number }[];

const STAGES = [
  { key: "extract", label: "Read the email", sub: "Extract requirements" },
  { key: "ensemble", label: "Deliberate", sub: "Agents design in parallel" },
  { key: "synthesis", label: "Synthesize", sub: "Merge the best ideas" },
] as const;

const LANG_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-Hant", label: "繁體中文" },
  { value: "bilingual", label: "雙語" },
];

const hkd = (n: number) =>
  "HKD " +
  (Number.isFinite(n) ? Math.round(n).toLocaleString("en-HK") : "n/a");

// Em/en dashes are a giveaway of machine-written prose; swap them for commas in
// any AI-generated text before it reaches the reader.
const clean = (s?: string) => (s ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s{2,}/g, " ");

// LLM-emitted product URLs often 404 or get bot-blocked. A Google search for the
// item + vendor always resolves to the real, current listing.
const searchLink = (query: string) =>
  "https://www.google.com/search?q=" + encodeURIComponent(query.trim());

// Per-agent model picker: a curated dropdown plus a "type any OpenRouter id" mode.
const CUSTOM_MODEL = "__custom__";
const MAX_AGENT_SLOTS = 12;
type Slot = { sel: string; customId: string };

export default function Home() {
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<
    { name: string; dataUrl: string; isPdf: boolean }[]
  >([]);
  const [slots, setSlots] = useState<Slot[]>(() =>
    MODEL_POOL.slice(0, 3).map((m) => ({ sel: m.id, customId: "" })),
  );
  const [lecturerCount, setLecturerCount] = useState("");
  const [lecturerRate, setLecturerRate] = useState("");
  const [tutorCount, setTutorCount] = useState("");
  const [tutorRate, setTutorRate] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stages, setStages] = useState<
    Record<string, { status: StageStatus; detail?: string }>
  >({});
  const [agents, setAgents] = useState<Record<number, AgentState>>({});
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [costSpread, setCostSpread] = useState<CostSpread>([]);
  const [final, setFinal] = useState<FinalProposal | null>(null);

  // Each slot resolves to one model id (a curated id or a typed custom id).
  const effectiveModels = useMemo(
    () =>
      slots
        .map((s) => (s.sel === CUSTOM_MODEL ? s.customId.trim() : s.sel))
        .filter(Boolean),
    [slots],
  );

  function updateSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function addSlot() {
    setSlots((prev) => {
      if (prev.length >= MAX_AGENT_SLOTS) return prev;
      const used = new Set(prev.map((s) => s.sel));
      const next = MODEL_POOL.find((m) => !used.has(m.id))?.id ?? MODEL_POOL[0].id;
      return [...prev, { sel: next, customId: "" }];
    });
  }
  function removeSlot(i: number) {
    setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList) return;
    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    const MAX_FILES = 8;
    const next: { name: string; dataUrl: string; isPdf: boolean }[] = [];
    const skipped: string[] = [];
    try {
      for (const file of Array.from(fileList)) {
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isImage = file.type.startsWith("image/");
        if (!isPdf && !isImage) {
          skipped.push(`${file.name} (only PDF or image files are supported)`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          skipped.push(`${file.name} (larger than 10 MB)`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error ?? new Error("could not read file"));
          r.readAsDataURL(file);
        });
        next.push({ name: file.name, dataUrl, isPdf });
      }
    } catch (e) {
      setError(`Could not read a file: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (next.length > 0) setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
    setError(skipped.length ? `Skipped ${skipped.join("; ")}.` : null);
  }

  function reset() {
    setStages({});
    setAgents({});
    setRequirements(null);
    setRuns([]);
    setCostSpread([]);
    setFinal(null);
    setError(null);
  }

  async function run() {
    if (running) return;
    if (!email.trim() && files.length === 0) {
      setError("Paste the organization's email and/or upload it as a PDF/image.");
      return;
    }
    if (effectiveModels.length === 0) {
      setError("Add at least one agent and give it a model.");
      return;
    }
    reset();
    setRunning(true);
    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          attachments: files.map((f) => f.dataUrl),
          models: effectiveModels,
          lecturerCount: lecturerCount ? Number(lecturerCount) : undefined,
          lecturerRateHKD: lecturerRate ? Number(lecturerRate) : undefined,
          tutorCount: tutorCount ? Number(tutorCount) : undefined,
          tutorRateHKD: tutorRate ? Number(tutorRate) : undefined,
          language,
        }),
      });
      if (!res.ok || !res.body) {
        setError(`Server error: ${res.status} ${await res.text()}`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function handleEvent(ev: any) {
    switch (ev.type) {
      case "stage":
        setStages((p) => ({ ...p, [ev.stage]: { status: ev.status, detail: ev.detail } }));
        break;
      case "agent":
        setAgents((p) => ({
          ...p,
          [ev.index]: {
            index: ev.index,
            model: ev.model,
            label: ev.label,
            provider: ev.provider,
            status: ev.status,
            detail: ev.detail,
          },
        }));
        break;
      case "data":
        if (ev.key === "requirements") setRequirements(ev.value);
        if (ev.key === "agent") setRuns((p) => [...p, ev.value]);
        if (ev.key === "costSpread") setCostSpread(ev.value);
        if (ev.key === "final") setFinal(ev.value);
        break;
      case "fatal":
        setError(ev.message);
        break;
    }
  }

  function downloadJson() {
    const blob = new Blob(
      [JSON.stringify({ requirements, runs, costSpread, final }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "course-proposal.json";
    a.click();
  }

  const maxCost = Math.max(1, ...costSpread.map((c) => c.estHKD));

  // ---- live status readout (drives the header light + progress bar) --------
  const agentVals = Object.values(agents);
  const agentsDone = agentVals.filter((a) => a.status === "done").length;
  const agentsErr = agentVals.filter((a) => a.status === "error").length;
  const agentsTotal = running
    ? Math.max(effectiveModels.length, agentVals.length)
    : agentVals.length;
  const extractDone = stages.extract?.status === "done";
  const synthGoing = stages.synthesis?.status === "start";

  let progress = 0;
  if (stages.extract?.status === "start") progress = 0.06;
  if (extractDone) progress = 0.15;
  if (agentsTotal > 0 && agentsDone > 0)
    progress = Math.max(progress, 0.15 + 0.65 * (agentsDone / agentsTotal));
  if (synthGoing) progress = Math.max(progress, 0.9);
  if (final) progress = 1;

  const tone: "idle" | "work" | "done" | "error" = error
    ? "error"
    : final
      ? "done"
      : running
        ? "work"
        : "idle";

  let statusLabel = "Ready";
  if (error) statusLabel = "Attention needed";
  else if (final) statusLabel = "Proposal ready";
  else if (running) {
    if (synthGoing) statusLabel = "Merging the best ideas";
    else if (extractDone && agentsTotal > 0)
      statusLabel = `Working · ${agentsDone}/${agentsTotal} agents`;
    else statusLabel = "Reading the email";
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <Splash />
      <TopBar
        tone={tone}
        label={statusLabel}
        progress={progress}
        agentsErr={agentsErr}
      />

      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[384px_minmax(0,1fr)] print:block">
        {/* ------------------------------- Console (controls) ------------- */}
        <section className="space-y-4 no-print">
          <Panel label="Source" hint="The school's inquiry">
            <textarea
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Paste the full course inquiry email from the school or kindergarten…"
              className="field h-40 resize-y font-sans"
            />
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-[9px] border border-dashed border-line bg-surface-2 px-3 py-2.5 text-sm text-ink2 transition hover:border-accent/60 hover:text-ink">
              <span className="flex items-center gap-2">
                <IconPaperclip />
                Attach a PDF or screenshot
                <span className="text-muted">(optional)</span>
              </span>
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                multiple
                onChange={(e) => onFiles(e.target.files)}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative">
                    {f.isPdf ? (
                      <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-line bg-bad-wash p-1 text-center">
                        <span className="text-[10px] font-bold text-bad">PDF</span>
                        <span className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-muted">
                          {f.name}
                        </span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.dataUrl}
                        alt={f.name}
                        className="h-16 w-16 rounded-lg border border-line object-cover"
                      />
                    )}
                    <button
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-xs text-paper"
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            label="Agents"
            hint={`${effectiveModels.length} agent${effectiveModels.length === 1 ? "" : "s"} · one model each`}
          >
            <div className="space-y-2">
              {slots.map((s, i) => {
                const isCustom = s.sel === CUSTOM_MODEL;
                return (
                  <div key={i} className="rounded-[9px] border border-line bg-surface-2 p-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink font-mono text-[11px] font-bold text-paper">
                        {i + 1}
                      </span>
                      <select
                        value={s.sel}
                        onChange={(e) => updateSlot(i, { sel: e.target.value })}
                        className="field min-w-0 flex-1 py-1.5"
                        aria-label={`Model for agent ${i + 1}`}
                      >
                        {MODEL_POOL.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label} · {m.provider}
                          </option>
                        ))}
                        <option value={CUSTOM_MODEL}>Custom OpenRouter model…</option>
                      </select>
                      {slots.length > 1 && (
                        <button
                          onClick={() => removeSlot(i)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-muted transition hover:bg-surface hover:text-bad"
                          aria-label={`Remove agent ${i + 1}`}
                          title="Remove agent"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {isCustom && (
                      <input
                        value={s.customId}
                        onChange={(e) => updateSlot(i, { customId: e.target.value })}
                        placeholder="e.g. anthropic/claude-sonnet-4.5"
                        spellCheck={false}
                        autoCapitalize="none"
                        className="field mt-2 font-mono text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={addSlot}
                disabled={slots.length >= MAX_AGENT_SLOTS}
                className="btn btn-ghost px-3 py-1.5 text-xs disabled:opacity-45"
              >
                + Add agent
              </button>
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-info hover:underline"
              >
                browse model ids ↗
              </a>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Pick a verified model, or choose “Custom” to paste any model id from
              OpenRouter. Custom models are not pre checked, so a failed one is
              skipped and the run continues.
            </p>
          </Panel>

          <Panel label="Staffing" hint="Blank = AI estimates">
            <StaffRow
              title="Lecturers"
              note="lead / head"
              count={lecturerCount}
              setCount={setLecturerCount}
              rate={lecturerRate}
              setRate={setLecturerRate}
              ratePlaceholder="500"
            />
            <div className="my-2.5 h-px bg-line-2" />
            <StaffRow
              title="Tutors"
              note="assistants"
              count={tutorCount}
              setCount={setTutorCount}
              rate={tutorRate}
              setRate={setTutorRate}
              ratePlaceholder="300"
            />
          </Panel>

          <Panel label="Output">
            <div className="flex rounded-[9px] border border-line bg-surface-2 p-1">
              {LANG_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setLanguage(o.value)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${
                    o.value === language
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              onClick={run}
              disabled={running}
              className="btn btn-primary mt-3 w-full py-3 text-[0.95rem]"
            >
              {running ? (
                <>
                  <Spinner /> Agents deliberating…
                </>
              ) : (
                <>
                  Generate proposal <IconArrow />
                </>
              )}
            </button>
            {error && (
              <p className="mt-3 rounded-[9px] border border-bad/25 bg-bad-wash px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
          </Panel>
        </section>

        {/* ------------------------------- Output bay --------------------- */}
        <section className="min-w-0">
          {final ? (
            <div className="space-y-5">
              <ProposalSummary
                final={final}
                agentCount={runs.length}
                onPrint={() => window.print()}
                onJson={downloadJson}
              />
              <FinalProposalView final={final} costSpread={costSpread} maxCost={maxCost} />
              {runs.length > 0 && (
                <AgentComparison
                  runs={runs}
                  recommended={final.recommendation?.mostEfficientAgent}
                />
              )}
            </div>
          ) : running ? (
            <LiveConsole stages={stages} agents={agents} requirements={requirements} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <footer className="no-print mx-auto max-w-[1240px] px-6 pb-10 pt-4 text-xs text-muted">
        Tech Tech Technology · Proposal Console. An internal AI tool; figures are
        drafts, so review them before sending.
      </footer>
    </main>
  );
}

/* ============================================================ chrome / bits */

function Splash() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // Remember that the intro has played, so a reload this session skips it.
    try {
      sessionStorage.setItem("splash-seen", "1");
    } catch {}
    const t = setTimeout(() => setHidden(true), 1650);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`splash ${hidden ? "is-hidden" : ""}`}
      aria-hidden="true"
      onClick={() => setHidden(true)}
    >
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Tech Tech Technology" className="splash-logo logo-blend" />
        <div className="splash-track">
          <div className="splash-bar" />
        </div>
      </div>
    </div>
  );
}

function TopBar({
  tone,
  label,
  progress,
  agentsErr,
}: {
  tone: "idle" | "work" | "done" | "error";
  label: string;
  progress: number;
  agentsErr: number;
}) {
  const dotClass = {
    idle: "stat-idle",
    work: "stat-work",
    done: "stat-done",
    error: "stat-err",
  }[tone];
  const barColor =
    tone === "error" ? "var(--bad)" : tone === "done" ? "var(--good)" : "var(--good)";
  return (
    <header className="console-bar sticky top-0 z-30 border-b border-black/20">
      <div className="relative mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Tech Tech Technology"
            className="logo-blend h-11 w-auto"
          />
          <span className="hidden h-8 w-px bg-white/15 sm:block" />
          <div className="hidden font-mono text-[10px] uppercase leading-tight tracking-[0.2em] text-console-muted sm:block">
            Course
            <br />
            Proposal Console
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
            role="status"
            aria-live="polite"
            title={
              tone === "work"
                ? "The AI agents are working"
                : tone === "error"
                  ? "Something needs your attention"
                  : tone === "done"
                    ? "The proposal is ready"
                    : "Idle — ready to run"
            }
          >
            <span className={`stat-dot ${dotClass}`} />
            <span className="tnum text-xs font-medium text-console-ink">{label}</span>
            {agentsErr > 0 && tone !== "idle" && (
              <span className="rounded-full bg-bad/20 px-1.5 text-[10px] font-semibold text-[color:#ffb4ab]">
                {agentsErr} failed
              </span>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>
      {/* live progress rail across the bottom of the console bar */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden">
        <div
          className="h-full rounded-r-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(progress * 100)}%`, background: barColor }}
        />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  const dark = mounted && theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-console-ink transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function Panel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="eyebrow">{label}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function StaffRow({
  title,
  note,
  count,
  setCount,
  rate,
  setRate,
  ratePlaceholder,
}: {
  title: string;
  note: string;
  count: string;
  setCount: (v: string) => void;
  rate: string;
  setRate: (v: string) => void;
  ratePlaceholder: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">
        {title} <span className="font-normal text-muted">· {note}</span>
      </p>
      <div className="flex items-center gap-2 text-sm">
        <input
          type="number"
          min={0}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="#"
          className="field tnum w-14 px-2 text-center"
        />
        <span className="text-muted">people ×</span>
        <span className="text-muted">HKD</span>
        <input
          type="number"
          min={0}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={ratePlaceholder}
          className="field tnum w-20 px-2 text-center"
        />
        <span className="text-muted">/ hr</span>
      </div>
    </div>
  );
}

/* ================================================================ states */

function EmptyState() {
  return (
    <div className="doc card rise overflow-hidden">
      <div className="border-b border-line bg-surface-2 px-7 py-8">
        <p className="eyebrow">What this does</p>
        <h1 className="mt-2 max-w-xl font-display text-[1.9rem] font-extrabold leading-[1.1] tracking-tight text-ink text-balance">
          Turn a school&apos;s email into a fully costed course proposal.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink2">
          Paste the inquiry on the left and hit generate. Several AI models each
          design the whole course independently and search the live web for
          prices, then the best ideas are merged into one proposal, with staffing
          and profit worked out.
        </p>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-3">
        {STAGES.map((s, i) => (
          <div key={s.key} className="bg-surface px-6 py-6">
            <span className="font-mono text-xs text-accent">0{i + 1}</span>
            <h3 className="mt-1 font-display text-base font-bold text-ink">{s.label}</h3>
            <p className="mt-1 text-sm text-muted">{s.sub}</p>
          </div>
        ))}
      </div>
      <div className="px-7 py-5 text-sm text-muted">
        Works for any subject, from robotics and coding to science and phonics.
        Output in English, Traditional Chinese, or both.
      </div>
    </div>
  );
}

function LiveConsole({
  stages,
  agents,
  requirements,
}: {
  stages: Record<string, { status: StageStatus; detail?: string }>;
  agents: Record<number, AgentState>;
  requirements: Requirements | null;
}) {
  const agentList = Object.values(agents).sort((a, b) => a.index - b.index);
  return (
    <div className="space-y-5 rise">
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="stat-dot stat-run" />
          <h2 className="font-display text-lg font-bold text-ink">
            The agents are deliberating
          </h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STAGES.map((s, i) => {
            const st = stages[s.key]?.status ?? "idle";
            return (
              <li
                key={s.key}
                className={`rounded-[10px] border p-3 ${
                  st === "start"
                    ? "border-accent/45 bg-accent-wash/60"
                    : st === "done"
                      ? "border-good/30 bg-good-wash"
                      : "border-line bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-2">
                  <StepNode status={st} n={i + 1} />
                  <span className="text-sm font-semibold text-ink">{s.label}</span>
                </div>
                <p className="mt-1.5 pl-8 text-xs text-muted">
                  {stages[s.key]?.detail ?? s.sub}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      {agentList.length > 0 && (
        <div className="card p-5">
          <p className="eyebrow mb-3">Ensemble · same task, different minds</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {agentList.map((a) => (
              <div key={a.index} className={`agent-card ${agentStateClass(a.status)} p-3`}>
                <div className="flex items-center justify-between gap-2 pl-2">
                  <span className="text-sm font-semibold text-ink">{a.label}</span>
                  <AgentBadge status={a.status} />
                </div>
                <p className="mt-0.5 pl-2 text-xs text-muted">{a.provider}</p>
                {a.detail && (
                  <p className="mt-1 pl-2 text-xs text-ink2">{a.detail}</p>
                )}
                {a.status === "start" && (
                  <div className="mt-2 ml-2 h-1 rounded-full bg-line-2">
                    <div className="shimmer h-1 w-full rounded-full" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {requirements && (
        <div className="card p-5">
          <p className="eyebrow mb-3">Understood so far</p>
          <RequirementsGrid r={requirements} />
        </div>
      )}
    </div>
  );
}

function StepNode({ status, n }: { status: StageStatus; n: number }) {
  const cls =
    status === "done"
      ? "bg-good text-white border-good"
      : status === "start"
        ? "bg-accent text-white border-accent"
        : status === "error"
          ? "bg-bad text-white border-bad"
          : "bg-surface text-muted border-line";
  return (
    <span
      className={`grid h-6 w-6 place-items-center rounded-full border font-mono text-[11px] font-bold ${cls}`}
    >
      {status === "done" ? "✓" : n}
    </span>
  );
}

function AgentBadge({ status }: { status: StageStatus }) {
  if (status === "done")
    return <span className="text-[11px] font-medium text-good">done</span>;
  if (status === "error")
    return <span className="text-[11px] font-medium text-bad">failed</span>;
  if (status === "start")
    return <span className="text-[11px] font-medium text-accent">working…</span>;
  return <span className="text-[11px] text-muted">queued</span>;
}

function agentStateClass(status: StageStatus) {
  if (status === "start") return "is-run";
  if (status === "done") return "is-done";
  if (status === "error") return "is-err";
  return "";
}

/* ============================================================== summary band */

function ProposalSummary({
  final,
  agentCount,
  onPrint,
  onJson,
}: {
  final: FinalProposal;
  agentCount: number;
  onPrint: () => void;
  onJson: () => void;
}) {
  const p = final.pricing;
  return (
    <div className="card rise overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5">
        <div className="min-w-0">
          <p className="eyebrow text-good">Proposal ready</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink text-balance">
            {final.requirements.courseTopic}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {final.requirements.targetAgeGroup} · {final.requirements.numberOfStudents}{" "}
            students · {final.requirements.numberOfLessons} lessons
          </p>
        </div>
        <div className="flex shrink-0 gap-2 no-print">
          <button onClick={onPrint} className="btn btn-ghost px-3 py-1.5 text-xs">
            <IconPrint /> Print / PDF
          </button>
          <button onClick={onJson} className="btn btn-ghost px-3 py-1.5 text-xs">
            <IconDownload /> JSON
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        <Stat label="Quote the school" value={hkd(p.suggestedPriceHKD)} accent />
        <Stat
          label="Estimated profit"
          value={hkd(p.estimatedProfitHKD)}
          sub={`${p.profitMarginPercent}% margin`}
          good
        />
        <Stat label="Cost to deliver" value={hkd(p.totalCostHKD)} sub="materials + staff" />
        <Stat
          label="Agents"
          value={String(agentCount)}
          sub={
            final.recommendation?.mostEfficientAgent
              ? `best: ${shortAgent(final.recommendation.mostEfficientAgent)}`
              : "compared"
          }
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  good,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  good?: boolean;
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`tnum mt-1 font-display text-xl font-extrabold leading-tight ${
          accent ? "text-accent" : good ? "text-good" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function shortAgent(s: string) {
  return s.replace(/\s*\(.*\)\s*/, "").trim();
}

/* ============================================================ the document */

function FinalProposalView({
  final,
  costSpread,
  maxCost,
}: {
  final: FinalProposal;
  costSpread: CostSpread;
  maxCost: number;
}) {
  const lineTotal = final.materials.reduce(
    (s, m) => s + m.quantity * m.estimatedUnitPriceHKD,
    0,
  );
  return (
    <div className="doc card rise-2 space-y-8 p-6 sm:p-8">
      <Section n={1} title="Course requirements">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Row label="Topic">{final.requirements.courseTopic}</Row>
          <Row label="Target">{final.requirements.targetAgeGroup}</Row>
          <Row label="Students">{final.requirements.numberOfStudents}</Row>
          <Row label="Lessons">{final.requirements.numberOfLessons}</Row>
          <Row label="Duration">{final.requirements.lessonDuration}</Row>
          <Row label="Tools / HW">{final.requirements.requiredToolsHardware}</Row>
        </dl>
      </Section>

      <Section n={2} title="Course outline">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">
          {clean(final.courseOutline)}
        </p>
      </Section>

      <Section n={3} title="Lesson structure">
        <div className="space-y-2.5">
          {final.lessons.map((l, li) => (
            <div key={li} className="rounded-[10px] border border-line bg-surface-2 p-4">
              <p className="font-display text-sm font-bold text-ink">
                <span className="tnum text-accent">Lesson {l.lessonNumber}</span> · {l.title}
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="eyebrow mb-1">Objectives</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink2">
                    {l.objectives.map((o, i) => (
                      <li key={i}>{clean(o)}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow mb-1">Activities</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink2">
                    {l.activities.map((a, i) => (
                      <li key={i}>{clean(a)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n={4} title="Materials & equipment" note="multiple sources compared">
        <div className="space-y-2.5">
          {final.materials.map((m, i) => (
            <div key={i} className="rounded-[10px] border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {m.name}{" "}
                    <span className="tnum font-normal text-muted">× {m.quantity}</span>
                  </p>
                  <p className="text-xs text-muted">{clean(m.purpose)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-bold text-ink">
                    {hkd(m.estimatedUnitPriceHKD)}
                    <span className="font-normal text-muted"> /unit</span>
                  </p>
                  {m.chosenVendor && (
                    <p className="text-xs text-muted">via {m.chosenVendor}</p>
                  )}
                </div>
              </div>

              {m.sources.length > 0 && (
                <div className="mt-2.5 rounded-lg bg-surface-2 p-2.5">
                  <p className="eyebrow mb-1.5">
                    {m.sources.length} source{m.sources.length > 1 ? "s" : ""} · cheapest first
                  </p>
                  <ul className="space-y-1">
                    {m.sources.map((s, si) => {
                      const chosen = s.vendor === m.chosenVendor;
                      return (
                        <li
                          key={si}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {si === 0 && (
                              <span className="rounded bg-good-wash px-1.5 py-px text-[10px] font-semibold text-good">
                                cheapest
                              </span>
                            )}
                            {chosen && (
                              <span className="rounded bg-accent-wash px-1.5 py-px text-[10px] font-semibold text-accent-ink">
                                chosen
                              </span>
                            )}
                            <a
                              href={s.url || searchLink(`${m.name} ${s.vendor}`)}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate font-medium text-info hover:underline"
                              title={
                                s.verified
                                  ? "Verified live listing"
                                  : "Opens a search for this item at this vendor."
                              }
                            >
                              {s.vendor || "search"}
                            </a>
                            {s.verified && (
                              <span className="text-good" title="Link checked, resolves">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="tnum shrink-0 font-medium text-ink2">
                            {hkd(s.unitPriceHKD)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {m.priceReasoning && (
                <p className="mt-2 text-xs italic text-muted">Why this pick: {clean(m.priceReasoning)}</p>
              )}
            </div>
          ))}
        </div>
        {final.materials.length > 0 && (
          <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-sm font-semibold">
            <span>Line item subtotal (chosen vendors)</span>
            <span className="tnum">{hkd(lineTotal)}</span>
          </div>
        )}
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section n={5} title="Material cost">
          <p className="tnum font-display text-3xl font-extrabold text-ink">
            {hkd(final.estimatedMaterialCostHKD)}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{clean(final.costBasis)}</p>
        </Section>

        <Section n={6} title="Cost comparison">
          <div className="space-y-1.5">
            {final.costComparison.map((c, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{c.optionName}</span>
                  <span className="text-muted">: {clean(c.description)}</span>
                </span>
                <span className="tnum shrink-0 font-semibold">{hkd(c.estimatedTotalHKD)}</span>
              </div>
            ))}
          </div>
          {costSpread.length > 1 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="eyebrow mb-2">Estimate spread by agent</p>
              <div className="space-y-1.5">
                {costSpread.map((c) => (
                  <div key={c.model} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate text-ink2">{c.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-2">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${(c.estHKD / maxCost) * 100}%` }}
                      />
                    </div>
                    <span className="tnum w-20 shrink-0 text-right text-ink2">
                      {hkd(c.estHKD)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      <Section title="Staffing" note="lecturers & tutors">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="eyebrow text-left [&>th]:pb-2 [&>th]:font-semibold">
                <th>Role</th>
                <th className="text-right">People</th>
                <th className="text-right">Hrs each</th>
                <th className="text-right">Rate / hr</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {(
                [
                  ["Lecturers", "lead", final.staffing.lecturers],
                  ["Tutors", "assistant", final.staffing.tutors],
                ] as const
              ).map(([label, note, r]) => (
                <tr key={label} className="border-t border-line [&>td]:py-2">
                  <td className="font-medium text-ink">
                    {label} <span className="text-muted">· {note}</span>
                  </td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right">{r.paidHoursEach}</td>
                  <td className="text-right">{hkd(r.hourlyRateHKD)}</td>
                  <td className="text-right font-medium">{hkd(r.costHKD)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-bold [&>td]:pt-2">
                <td colSpan={4}>Total staff cost</td>
                <td className="text-right">{hkd(final.staffing.totalStaffCostHKD)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {final.staffing.rationale && (
          <p className="mt-2 text-xs text-muted">{clean(final.staffing.rationale)}</p>
        )}
      </Section>

      {/* profitability — semantic green, the money headline */}
      <div className="overflow-hidden rounded-[12px] border border-good/30 bg-good-wash">
        <div className="flex items-center gap-2 border-b border-good/20 px-5 py-3">
          <IconTrend />
          <h3 className="font-display text-sm font-bold text-good">
            Profitability and the recommended quote
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-px bg-good/15 text-center">
          <MoneyCell label="Our cost" value={hkd(final.pricing.totalCostHKD)} sub="materials + staff" />
          <MoneyCell label="Quote" value={hkd(final.pricing.suggestedPriceHKD)} strong />
          <MoneyCell
            label="Profit"
            value={hkd(final.pricing.estimatedProfitHKD)}
            sub={`${final.pricing.profitMarginPercent}% margin`}
            strong
          />
        </div>
        <div className="space-y-1 px-5 py-3">
          <p className="tnum text-xs text-ink2">
            materials {hkd(final.pricing.materialsCostHKD)} + staff{" "}
            {hkd(final.pricing.staffCostHKD)} = {hkd(final.pricing.totalCostHKD)} cost
          </p>
          {final.pricing.reasoning && (
            <p className="text-sm leading-relaxed text-ink2">{clean(final.pricing.reasoning)}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section n={7} title="Assumptions">
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink2">
            {final.assumptions.map((a, i) => (
              <li key={i}>{clean(a)}</li>
            ))}
          </ul>
        </Section>
        <Section n={8} title="Confirm with the client">
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink2">
            {final.missingInformation.map((m, i) => (
              <li key={i}>{clean(m)}</li>
            ))}
          </ul>
        </Section>
      </div>

      {/* how the agents were combined */}
      <div className="border-t border-line pt-6">
        <h3 className="font-display text-base font-bold text-ink">
          Why each agent decided what it did
        </h3>
        {final.recommendation?.mostEfficientAgent && (
          <div className="mt-3 rounded-[10px] border border-accent/35 bg-accent-wash p-4">
            <p className="eyebrow text-accent-ink">★ Most efficient, best value for best results</p>
            <p className="mt-1 font-display text-sm font-bold text-accent-ink">
              {final.recommendation.mostEfficientAgent}
            </p>
            <p className="mt-1 text-sm text-ink2">{clean(final.recommendation.reasoning)}</p>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {final.agentDecisions?.map((d, i) => {
            const rec = isRecommended(d.agent, final.recommendation?.mostEfficientAgent);
            return (
              <div
                key={i}
                className={`rounded-[10px] border p-4 ${
                  rec ? "border-accent/35 bg-accent-wash/50" : "border-line"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">
                    {rec && <span className="mr-1 text-accent">★</span>}
                    {d.agent}
                  </p>
                  <p className="tnum shrink-0 text-sm font-bold text-ink2">
                    {hkd(d.estimatedTotalHKD)}
                  </p>
                </div>
                {d.approachSummary && (
                  <p className="mt-0.5 text-xs text-muted">{clean(d.approachSummary)}</p>
                )}
                <p className="mt-1.5 text-sm text-ink2">
                  <span className="font-medium text-ink">Reasoning: </span>
                  {clean(d.reasoning)}
                </p>
                {d.strengths && (
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium">Strengths: </span>
                    {clean(d.strengths)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 rounded-[10px] bg-surface-2 p-4">
          <p className="eyebrow">How the agents were combined</p>
          <p className="mt-1 text-sm text-ink2">{clean(final.synthesisNotes)}</p>
        </div>
      </div>
    </div>
  );
}

function MoneyCell({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="bg-good-wash px-3 py-4">
      <p className="text-[11px] uppercase tracking-wide text-good/80">{label}</p>
      <p
        className={`tnum mt-1 font-display font-extrabold leading-tight ${
          strong ? "text-xl text-good" : "text-lg text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink2">{sub}</p>}
    </div>
  );
}

/* ========================================================= agent comparison */

const FX_FALLBACK: Record<string, number> = {
  HKD: 1, USD: 7.8, CNY: 1.08, RMB: 1.08, EUR: 8.5, GBP: 9.9, JPY: 0.05, TWD: 0.24, SGD: 5.8,
};
function toHKD(
  unitPrice: number,
  currency: string,
  fxRates: { currency: string; hkdPerUnit: number }[],
): number {
  const cur = (currency || "HKD").trim().toUpperCase();
  if (cur === "HKD" || cur === "") return unitPrice;
  const stated = fxRates.find((r) => r.currency.trim().toUpperCase() === cur)?.hkdPerUnit;
  return unitPrice * (stated && stated > 0 ? stated : FX_FALLBACK[cur] ?? 1);
}

function AgentComparison({
  runs,
  recommended,
}: {
  runs: AgentRun[];
  recommended?: string;
}) {
  const sorted = [...runs].sort((a, b) => a.index - b.index);
  return (
    <div className="card rise-2 p-6 no-print">
      <h2 className="font-display text-lg font-bold text-ink">
        Compare the agents side by side
      </h2>
      <p className="mb-4 mt-0.5 text-sm text-muted">
        Every agent designed the course independently. Compare their picks and
        reasoning to judge which is better. ★ marks the recommended one.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {sorted.map((r) => {
          const rec = isRecommended(`${r.label} (${r.provider})`, recommended);
          const p = r.proposal;
          return (
            <div
              key={r.index}
              className={`rounded-[11px] border p-4 ${
                rec ? "border-accent/45 bg-accent-wash/50" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ink">
                  {rec && <span className="mr-1 text-accent">★</span>}
                  {r.label} <span className="font-normal text-muted">· {r.provider}</span>
                </p>
                <div className="shrink-0 text-right text-xs">
                  <p className="tnum font-bold text-ink">
                    {hkd(p.estimatedMaterialCostHKD)}{" "}
                    <span className="font-normal text-muted">mat.</span>
                  </p>
                  <p className="tnum text-muted">
                    quote {hkd(p.pricing.suggestedPriceHKD)} · {p.staffing.lecturers.count}L/
                    {p.staffing.tutors.count}T
                  </p>
                </div>
              </div>

              <p className="tnum mt-1 text-xs text-muted">
                {p.lessons.length} lessons · {p.materials.length} materials
              </p>

              {p.reasoning && (
                <p className="mt-2 text-xs leading-relaxed text-ink2">
                  <span className="font-medium text-ink">Why: </span>
                  {clean(p.reasoning)}
                </p>
              )}

              {p.materials.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <p className="eyebrow">Materials it chose &amp; why</p>
                  {p.materials.map((m, mi) => {
                    const chosen =
                      m.sources.find((s) => s.vendor === m.recommendedVendor) ?? m.sources[0];
                    return (
                      <div key={mi} className="rounded-lg bg-surface-2 px-2.5 py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-ink">
                            {m.name}{" "}
                            <span className="tnum font-normal text-muted">× {m.quantity}</span>
                          </span>
                          {chosen && (
                            <span className="tnum shrink-0 text-ink2">
                              {hkd(toHKD(chosen.unitPrice, chosen.currency, p.fxRates))}{" "}
                              <a
                                href={searchLink(`${m.name} ${chosen.vendor}`)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-info hover:underline"
                              >
                                {chosen.vendor || "search"}
                              </a>
                            </span>
                          )}
                        </div>
                        {m.priceReasoning && (
                          <p className="mt-0.5 italic text-muted">{clean(m.priceReasoning)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isRecommended(agent: string, recommended?: string): boolean {
  if (!recommended) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = norm(agent);
  const r = norm(recommended);
  return Boolean(a && r && (a.includes(r) || r.includes(a)));
}

function RequirementsGrid({ r }: { r: Requirements }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
      <Row label="Organization">{r.organizationName}</Row>
      <Row label="Topic">{r.courseTopic}</Row>
      <Row label="Target">{r.targetAgeGroup}</Row>
      <Row label="Students">{r.numberOfStudents || "?"}</Row>
      <Row label="Lessons">{r.numberOfLessons || "?"}</Row>
      <Row label="Duration">{r.lessonDuration}</Row>
      {r.existingEquipment?.length > 0 && (
        <Row label="Already has">{r.existingEquipment.join(", ")}</Row>
      )}
    </dl>
  );
}

function Section({
  n,
  title,
  note,
  children,
}: {
  n?: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2.5">
        {n != null && (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink font-mono text-xs font-bold text-paper">
            {n}
          </span>
        )}
        <h3 className="font-display text-base font-bold tracking-tight text-ink">{title}</h3>
        {note && <span className="text-xs text-muted">· {note}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}

/* ==================================================================== icons */

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function IconPaperclip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.5a1.7 1.7 0 0 1-2.3-2.3l7.9-7.9" />
    </svg>
  );
}
function IconPrint() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-good">
      <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
