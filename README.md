# Tech Tech Technology - AI Course Proposal Engine (public demo)

An AI agent prototype that turns a school's **quotation-invitation email** into a
complete, costed **course proposal** in seconds — built for
[Tech Tech Technology](https://techtechtechnology.com), a Hong Kong education
company that runs MatataLab coding-robot courses for schools and kindergartens.

This is a **public, no-login copy** for open demo access.

> **Live demo:** https://techtech-public-e07gp3evy-reys-projects-3a73006b.vercel.app

---

## The mission

When a school emails asking for a course, our team normally spends hours reading
the request, designing a syllabus, searching shops for equipment prices, working
out how many tutors are needed, and writing a quotation. This tool does that
**first draft automatically**, so staff can review and send instead of starting
from a blank page.

## What it does

You paste the school's email (or upload it as a PDF / screenshot), choose which
AI models to run and the output language, then the system:

1. **Reads the email** and extracts the requirements — course topic, age group,
   number of students, number of lessons, equipment already owned, etc.
2. **Runs several AI agents in parallel** — each a *different* AI model. They
   don't split the job; **each one independently designs the whole course** so
   we get genuinely different ideas to compare.
3. **Searches the live web** for the required materials, finding **multiple
   vendors per item** so the cheapest reputable option can be chosen.
4. **Merges the best ideas** from all agents into one final proposal and picks
   the **most efficient (best-value) approach**.
5. Produces a client-ready proposal with **8 sections**, tutor staffing, and a
   **profit calculation**.

## Why it's useful (the benefit)

- **Hours → seconds** for a first-draft proposal.
- **Cheaper sourcing** — compares multiple shops and shows the lowest price, plus
  a "cheapest-possible total."
- **Real, working links** — every material link is checked; dead links are
  replaced with a search that always finds the product.
- **Knows the numbers** — computes material cost + tutor pay = our cost, then a
  suggested quote and the **profit margin** (never lets us quote below cost).
- **Topic-agnostic** — works for robotics, coding, science, phonics… any course.
- **Bilingual** — output in English, Traditional Chinese (繁體中文), or both.

## The final proposal always includes

1. Extracted course requirements
2. Proposed course outline
3. Lesson-by-lesson structure (objectives + activities)
4. Required materials / equipment — with **multiple compared sources & links**
5. Estimated material cost (HKD)
6. Cost comparison (options + per-agent spread)
7. Assumptions
8. Missing information to confirm with the client

Plus: **tutor staffing** (how many tutors, pay rate, total), a **profitability
panel** (cost → suggested quote → profit), and a **side-by-side agent comparison**
showing each AI's choices and reasoning.

## Controls

- **AI agents** — tick any combination of models (each a different "opinion").
- **Tutor pay (HKD/hour)** — leave blank to let the AI estimate, or fill in your
  own rate.
- **Output language** — English · 繁體中文 · Bilingual.

## How it works (architecture)

```
Email / PDF  ──▶  [1] EXTRACT (vision model reads requirements)
                        │
                        ▼
                  [2] ENSEMBLE — N different AI models, in parallel,
                        each does the FULL task + live web search 🌐
                        │
                        ▼
                  [3] SYNTHESIZE — merge best ideas, resolve conflicts,
                        pick the most profitable approach
                        │
                        ▼
                  [4] VERIFY LINKS — check every source URL
                        │
                        ▼
                  Final proposal (8 sections + staffing + profit)
```

Built with **Next.js (App Router)**, the **Vercel AI SDK**, **OpenRouter** (for
access to many AI models), and **Tailwind CSS**. Results stream live to the
browser so you can watch each agent work.

## Engineering highlights

- **No single point of failure** — extraction and synthesis retry across fallback
  models; if synthesis fails the run degrades to the best single agent instead of
  losing all work.
- **Money computed in code** — material totals, tutor cost, and profit are summed
  by the app (not guessed by an AI), so figures are always consistent.
- **Grounded sourcing** — only the search agents touch the web; the merge step is
  forbidden from inventing prices or URLs.
- **Guardrails** — a minimum markup floor prevents quoting below cost; already-
  owned equipment (e.g. "we already have iPads") is excluded from the bill.

## Run it locally

```bash
npm install
# create .env.local (see below)
npm run dev        # http://localhost:3000
```

### `.env.local` (not committed)

```
OPENROUTER_API_KEY=sk-or-...      # get one at https://openrouter.ai/keys
DEFAULT_MARKUP_PERCENT=30         # minimum markup floor for the quote
```

> The API key is **never** committed — `.env.local` is gitignored. On Vercel it
> is set as an encrypted environment variable.

## Project layout

```
app/page.tsx               Dashboard UI (inputs, live progress, final proposal)
app/api/proposal/route.ts  Streams pipeline events (NDJSON) to the browser
lib/agents.ts              extract → ensemble → synthesize → verify links
lib/pool.ts                the AI model pool
lib/openrouter.ts          model access + selection helpers
lib/schemas.ts             typed shapes for every stage (zod)
scripts/*.mjs              model health-check probes
```

## About this copy

This repo is a **public, unauthenticated** version of the main internal tool —
no login of any kind, open for anyone with the link. There is no per-user access
control, so treat the demo link as something to share intentionally rather than
post publicly (API usage is billed to a shared, capped key).

---

*Prototype built as an internship / work project at Tech Tech Technology.*
