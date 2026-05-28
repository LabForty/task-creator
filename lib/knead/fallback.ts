import type { KneadQuestion } from "./types";

// Deterministic first-round fallback used when the model returns `complete`
// before asking a single question. Three sturdy questions — two business,
// one technical — that any epic benefits from.
export const FALLBACK_FIRST_ROUND: KneadQuestion[] = [
  {
    id: "q-surfaces",
    prompt: "Which product surfaces are impacted?",
    section: "business",
    type: "multi",
    options: ["Web app", "Admin console", "API", "Mobile", "Background jobs"],
  },
  {
    id: "q-users",
    prompt: "Who is the primary user benefiting from this work?",
    section: "business",
    type: "text",
  },
  {
    id: "q-risk",
    prompt: "What is the biggest technical risk to delivering this?",
    section: "technical",
    type: "text",
  },
];
