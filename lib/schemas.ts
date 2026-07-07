import { z } from "zod";

export const LANGUAGES = ["en", "zh-Hant", "bilingual"] as const;
export type Language = (typeof LANGUAGES)[number];

// ---------------------------------------------------------------------------
// Stage 1 — requirements extracted from the organization's email. Topic-agnostic:
// works for any course subject, not just robotics.
// ---------------------------------------------------------------------------
export const RequirementsSchema = z.object({
  organizationName: z.string().describe("School/organization name, or 'Unknown'"),
  courseTopic: z.string().describe("The subject of the requested course"),
  targetAgeGroup: z.string().describe("Age group / student level, or 'Unknown'"),
  numberOfStudents: z.number().describe("Total students, 0 if not stated"),
  numberOfClasses: z.number().describe("Number of classes, 1 if not stated"),
  numberOfLessons: z.number().describe("Number of lessons, 0 if not stated"),
  lessonDuration: z.string().describe("e.g. '1 hour per lesson', or 'Unknown'"),
  schedule: z.string().describe("Dates / period / time if mentioned, else 'Unknown'"),
  requiredToolsHardware: z
    .array(z.string())
    .describe("Tools / hardware / kits explicitly named in the email; [] if none"),
  existingEquipment: z
    .array(z.string())
    .describe(
      "Equipment the school SAYS IT ALREADY HAS (e.g. 'iPads', 'computer room', " +
        "'laptops') — these must NOT be re-purchased or costed. [] if none mentioned.",
    ),
  otherConstraints: z
    .array(z.string())
    .describe("Budget, student-teacher ratio, certificates, venue, showcase, etc."),
  emailLanguage: z.string().describe("Language the email was written in"),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

// ---------------------------------------------------------------------------
// Stage 2 — ONE agent's independent, complete proposal. Every ensemble agent
// (a different model) returns this same shape.
// ---------------------------------------------------------------------------
const LessonSchema = z.object({
  lessonNumber: z.number(),
  title: z.string(),
  objectives: z.array(z.string()).describe("Learning objectives for this lesson"),
  activities: z.array(z.string()).describe("Hands-on activities for this lesson"),
});

// One vendor's listing for a material (found via live web search). Each material
// carries SEVERAL of these so prices can be compared and the cheapest chosen.
const AgentSourceSchema = z.object({
  vendor: z
    .string()
    .describe("Store / marketplace, e.g. 'Taobao', 'Amazon', 'RS Components', official store"),
  unitPrice: z.number().describe("Listed unit price as shown; 0 if unknown"),
  currency: z.string().describe("ISO code, e.g. 'HKD','USD','CNY'"),
  url: z.string().describe("Real listing URL; '' if none"),
});

// Staffing: two roles. Lecturers = senior/lead instructors ("the head"); tutors
// = assistant instructors. Counts and rates can be overridden by the user.
const StaffRoleSchema = z.object({
  count: z.number().describe("How many people in this role"),
  paidHoursEach: z.number().describe("Hours EACH person works over the whole course"),
  hourlyRateHKD: z.number().describe("Realistic Hong Kong pay per hour, in HKD"),
  costHKD: z.number().describe("Total pay for this role = count x hours x rate"),
});

const StaffingSchema = z.object({
  lecturers: StaffRoleSchema.describe("Lecturers = senior / lead instructors (the head)"),
  tutors: StaffRoleSchema.describe("Tutors = assistant instructors"),
  totalStaffCostHKD: z.number().describe("Lecturer cost + tutor cost"),
  rationale: z.string().describe("Why this many lecturers/tutors and these rates"),
});

export const AgentProposalSchema = z.object({
  courseOutline: z.string().describe("A cohesive overview of the whole course"),
  lessons: z
    .array(LessonSchema)
    .describe("Lesson-by-lesson structure covering the full course"),
  materials: z
    .array(
      z.object({
        name: z.string(),
        purpose: z.string().describe("Why this material is needed"),
        quantity: z.number(),
        sources: z
          .array(AgentSourceSchema)
          .describe(
            "MULTIPLE real listings for the SAME item from DIFFERENT vendors " +
              "(aim for 2-4), found via live web search, so prices can be compared",
          ),
        recommendedVendor: z
          .string()
          .describe("Which of the sources you would actually buy from"),
        priceReasoning: z
          .string()
          .describe(
            "Why that source/price — the trade-off weighed (cheapest vs shipping, " +
              "quality, lead time, bulk discount)",
          ),
      }),
    )
    .describe("Materials/equipment, each with multiple compared sources"),
  costOptions: z
    .array(
      z.object({
        optionName: z.string().describe("e.g. 'Budget (marketplace)','Premium (official)'"),
        description: z.string(),
        estimatedTotalHKD: z.number(),
      }),
    )
    .describe("At least two costed options so they can be compared"),
  estimatedMaterialCostHKD: z
    .number()
    .describe("This agent's single best estimate of total material cost, in HKD"),
  fxRates: z
    .array(z.object({ currency: z.string(), hkdPerUnit: z.number() }))
    .describe(
      "The FX rates you assumed to convert every non-HKD price to HKD, " +
        "e.g. [{currency:'USD',hkdPerUnit:7.8},{currency:'CNY',hkdPerUnit:1.08}]. " +
        "[] only if every price was already in HKD.",
    ),
  staffing: StaffingSchema.describe(
    "Instructor staffing plan. Two roles: LECTURERS (senior/lead instructors — " +
      "the head) and TUTORS (assistant instructors). Both are part of what we deliver.",
  ),
  pricing: z
    .object({
      suggestedPriceHKD: z
        .number()
        .describe("The total price to QUOTE the school — set to realistically maximize profit"),
      reasoning: z
        .string()
        .describe(
          "How you set this price to maximize profit while staying realistic/competitive " +
            "for Hong Kong schools & kindergartens (e.g. per-student benchmark, typical margin)",
        ),
    })
    .describe("Your recommended quote to the client, aimed at best realistic profit"),
  reasoning: z
    .string()
    .describe(
      "Your overall decision-making: why this course design, why these materials and " +
        "vendors, what cost trade-offs you made, and why your total is what it is",
    ),
  assumptions: z.array(z.string()),
  summary: z.string().describe("Short draft proposal summary"),
});
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

// ---------------------------------------------------------------------------
// Stage 3 — the synthesized final proposal. Contains all 8 required sections.
// Text content is written in the user's chosen output language.
// ---------------------------------------------------------------------------
const FinalSourceSchema = z.object({
  vendor: z.string(),
  unitPriceHKD: z.number().describe("This vendor's unit price converted to HKD"),
  url: z.string(),
  // Overwritten by the server after checking the link — just output false.
  verified: z.boolean().describe("Always output false; the server sets this after checking."),
});

export const FinalProposalSchema = z.object({
  // (1) Extracted course requirements — restated cleanly for the client
  requirements: z.object({
    courseTopic: z.string(),
    targetAgeGroup: z.string(),
    numberOfStudents: z.string(),
    numberOfLessons: z.string(),
    lessonDuration: z.string(),
    requiredToolsHardware: z.string(),
  }),
  // (2) Proposed course outline
  courseOutline: z.string(),
  // (3) Lesson structure
  lessons: z.array(LessonSchema),
  // (4) Required materials or equipment — EACH with multiple compared sources
  materials: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      quantity: z.number(),
      sources: z
        .array(FinalSourceSchema)
        .describe("Multiple compared sources for this item (different vendors), prices in HKD"),
      chosenVendor: z.string().describe("The recommended vendor (best value)"),
      estimatedUnitPriceHKD: z.number().describe("The chosen unit price in HKD"),
      priceReasoning: z
        .string()
        .describe("Why this vendor/price was chosen over the cheaper/pricier alternatives"),
    }),
  ),
  // (5) Estimated material costs
  estimatedMaterialCostHKD: z.number(),
  costBasis: z.string().describe("How the total was derived + FX assumptions"),
  // Instructor staffing — lecturers (lead) + tutors (assistants)
  staffing: StaffingSchema,
  // Profitability — what it costs us to deliver vs what we should quote
  pricing: z.object({
    materialsCostHKD: z.number(),
    staffCostHKD: z.number().describe("Lecturers + tutors pay"),
    totalCostHKD: z.number().describe("Materials + staff = our cost to deliver"),
    suggestedPriceHKD: z.number().describe("Recommended quote to the school"),
    estimatedProfitHKD: z.number(),
    profitMarginPercent: z.number(),
    reasoning: z.string().describe("How the price realistically maximizes profit"),
  }),
  // (6) Cost comparison
  costComparison: z.array(
    z.object({
      optionName: z.string(),
      description: z.string(),
      estimatedTotalHKD: z.number(),
    }),
  ),
  // FX rates used to normalise every material price to HKD (transparency)
  fxRates: z
    .array(z.object({ currency: z.string(), hkdPerUnit: z.number() }))
    .describe("The canonical FX table used, e.g. [{currency:'USD',hkdPerUnit:7.8}]"),
  // The whole point of the ensemble: each agent's preserved reasoning...
  agentDecisions: z
    .array(
      z.object({
        agent: z.string().describe("Agent label + provider, e.g. 'GPT-4o (OpenAI)'"),
        approachSummary: z.string().describe("This agent's approach in 1-2 sentences"),
        estimatedTotalHKD: z.number(),
        reasoning: z.string().describe("This agent's decision-making and reasoning, preserved"),
        strengths: z.string().describe("What this agent did best / where its idea won"),
      }),
    )
    .describe("Each agent's reasoning, preserved so staff see WHY each one decided as it did"),
  // ...and an explicit pick of the single most efficient agent.
  recommendation: z.object({
    mostEfficientAgent: z
      .string()
      .describe(
        "Which agent's plan is the most efficient BUDGET for the best realistic PROFIT " +
          "(best value delivered vs cost, healthy margin) — not just the cheapest",
      ),
    reasoning: z
      .string()
      .describe("WHY it maximizes profit realistically while still giving the school good value"),
  }),
  // (7) Assumptions
  assumptions: z.array(z.string()),
  // (8) Missing information to confirm with the client
  missingInformation: z.array(z.string()),
  // Transparency: how the agents were merged
  synthesisNotes: z
    .string()
    .describe("How the different agents' ideas were combined and conflicts resolved"),
});
export type FinalProposal = z.infer<typeof FinalProposalSchema>;

// A tiny, focused schema for the Opus budget-verification pass. Kept small on
// purpose so the (pricey) model only needs a few output tokens.
export const BudgetCheckSchema = z.object({
  materialsSubtotalHKD: z.number().describe("sum of every material's quantity x unit price"),
  lecturerCostHKD: z.number().describe("lecturers: count x hours each x rate"),
  tutorCostHKD: z.number().describe("tutors: count x hours each x rate"),
  totalCostHKD: z.number().describe("materials + lecturers + tutors"),
  note: z.string().describe("max 12 words: flag any wrong quantity or odd price, else 'ok'"),
});
export type BudgetCheck = z.infer<typeof BudgetCheckSchema>;
