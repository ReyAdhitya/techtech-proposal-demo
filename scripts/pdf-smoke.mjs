// Verifies the PDF intake path: builds a real PDF, sends it to the vision model
// exactly like the pipeline does, and checks the fields come back.
// Run: node scripts/pdf-smoke.mjs
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

// --- build a minimal, valid single-page PDF with the RFQ text ---
function buildPdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let stream = "BT\n/F1 12 Tf\n50 760 Td\n";
  lines.forEach((l, i) => {
    if (i > 0) stream += "0 -18 Td\n";
    stream += `(${esc(l)}) Tj\n`;
  });
  stream += "ET";

  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += String(o).padStart(10, "0") + " 00000 n \n";
  });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

const pdf = buildPdf([
  "Written Quotation Request Form",
  "Course: MatataLab Coding Robot Course (2026-2027)",
  "Service period: October 2026 to June 2027 (20 lessons)",
  "Time: 4:15-5:15 pm, one hour per lesson",
  "Location: school classroom",
  "Format: small group, student-teacher ratio about 1:14",
  "Students: 15 kindergarten students, 1 class",
]);
const dataUrl = "data:application/pdf;base64," + pdf.toString("base64");

// --- send it exactly like intake() does ---
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/OPENROUTER_API_KEY=(.+)/)?.[1]?.trim();
const openrouter = createOpenRouter({ apiKey: key });

const t = Date.now();
try {
  const { object } = await generateObject({
    model: openrouter("google/gemini-2.5-flash"),
    schema: z.object({
      courseName: z.string(),
      totalLessons: z.number(),
      studentsPerClass: z.number(),
      studentTeacherRatio: z.string(),
    }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Read the attached RFQ PDF and extract the fields." },
          { type: "file", data: dataUrl, mediaType: "application/pdf", filename: "rfq.pdf" },
        ],
      },
    ],
  });
  console.log(`✅ PDF read OK (${Date.now() - t}ms):`, JSON.stringify(object));
} catch (e) {
  console.log("❌ PDF read failed:", e.message);
}
