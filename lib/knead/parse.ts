import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";
import {
  type KneadModelResult,
  type KneadOutcome,
  type KneadQuestion,
  MAX_QUESTIONS_PER_ROUND,
  MAX_FREE_ROUNDS,
  DEFAULT_CAP_JUSTIFICATION,
} from "./types";

export const KneadQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    section: z.enum(["business", "technical"]),
    type: z.enum(["text", "single", "multi"]),
    options: z.array(z.string().min(1)).optional(),
  })
  .refine((q) => (q.type === "text" ? !q.options || q.options.length === 0 : (q.options?.length ?? 0) >= 2), {
    message: "single/multi questions need at least 2 options; text questions need none",
    path: ["options"],
  });

const ModelResultSchema = z.union([
  z.object({
    kind: z.literal("questions"),
    questions: z.array(KneadQuestionSchema).min(1),
    justification: z.string().optional(),
  }),
  z.object({ kind: z.literal("complete") }),
]);

export function parseKneadResponse(raw: string): KneadModelResult {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`knead: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`knead: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const parsed = ModelResultSchema.parse(json);
  if (parsed.kind === "questions") {
    return { ...parsed, questions: parsed.questions.slice(0, MAX_QUESTIONS_PER_ROUND) };
  }
  return parsed;
}

// completedRounds = number of already-answered rounds sent in the request.
// Rounds 1..MAX_FREE_ROUNDS are free; generating round MAX_FREE_ROUNDS+1 needs
// explicit override approval, surfaced as cap_reached.
// Accept readonly/literal-shaped inputs (e.g. objects built with `as const`)
// without forcing callers to copy into mutable arrays.
type KneadModelResultInput =
  | { kind: "questions"; questions: readonly KneadQuestion[]; justification?: string }
  | { kind: "complete" };

export function applyCap(
  result: KneadModelResultInput,
  completedRounds: number,
  overrideApproved: boolean,
): KneadOutcome {
  if (result.kind === "complete") return { kind: "complete" };
  if (completedRounds >= MAX_FREE_ROUNDS && !overrideApproved) {
    return { kind: "cap_reached", justification: result.justification?.trim() || DEFAULT_CAP_JUSTIFICATION };
  }
  return { kind: "questions", round: { questions: [...result.questions] } };
}
