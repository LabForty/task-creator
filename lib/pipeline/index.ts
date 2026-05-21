import { z } from "zod";
import {
  RequirementSchema,
  StorySchema,
  type Requirement,
  type Story,
  type GateResult,
  type DraftInput,
} from "./types";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

// Extract the first balanced top-level JSON object from `raw`. Tolerates:
//   - leading prose ("Here's the JSON:\n{...}")
//   - markdown code fences (```json {...} ```)
//   - trailing prose ("{...}\nLet me know if…")
// Skips braces inside string literals so quoted `}` doesn't end the scan early.
export function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseRequirement(raw: string): ParseResult<Requirement> {
  const candidate = extractJsonObject(raw);
  if (!candidate) {
    return { ok: false, errors: ["analyst output contained no JSON object"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (e) {
    return { ok: false, errors: [`analyst output was not valid JSON: ${(e as Error).message}`] };
  }
  const result = RequirementSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, errors: formatZodErrors(result.error) };
  }
  return { ok: true, value: result.data };
}

export function parseStory(raw: string): ParseResult<Story> {
  const candidate = extractJsonObject(raw);
  if (!candidate) {
    return { ok: false, errors: ["planner output contained no JSON object"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (e) {
    return { ok: false, errors: [`planner output was not valid JSON: ${(e as Error).message}`] };
  }
  const result = StorySchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, errors: formatZodErrors(result.error) };
  }
  return { ok: true, value: result.data };
}

// Quick check: does the rendered markdown contain an "Acceptance criteria"
// section the export-time extractor will recognise? Heading style OR bold
// label style both count. Exposed as a standalone helper so the schema
// gate (in runPlanner) can throw before the consistency gate and trigger
// an automatic retry with a targeted hint.
export function hasAcceptanceCriteriaSection(markdown: string): boolean {
  if (!markdown) return false;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (/^#{1,6}\s+.*\bacceptance\s*criteria\b/i.test(line)) return true;
    if (/^\*\*[^*]*\bacceptance\s*criteria\b[^*]*\*\*/i.test(line)) return true;
  }
  return false;
}

// Consistency check between the analyst's analysis and the planner's story.
// Cheap, deterministic, and runs in-process — no external CLI. The goal is
// catching obvious mismatches (planner emitted empty markdown, ignored the
// mandatory AC section, or echoed an out-of-scope item verbatim).
export function checkConsistency(req: Requirement, story: Story): GateResult {
  const errors: string[] = [];

  if (!story.title.trim()) {
    errors.push("story.title is empty");
  }
  if (!story.markdown.trim()) {
    errors.push("story.markdown is empty");
  } else if (!hasAcceptanceCriteriaSection(story.markdown)) {
    errors.push(
      "story.markdown is missing an Acceptance Criteria section (mandatory; planner must emit one even when the template doesn't)",
    );
  }

  // Out-of-scope leak detection: case-insensitive substring search over the
  // rendered markdown body. Tokens shorter than 6 chars are ignored to avoid
  // matching unrelated words.
  if (req.outOfScope.length && story.markdown) {
    const hay = story.markdown.toLowerCase();
    for (const item of req.outOfScope) {
      const needle = item.toLowerCase().trim();
      if (needle.length < 6) continue;
      if (hay.includes(needle)) {
        errors.push(`out-of-scope item appears in story: "${item}"`);
      }
    }
  }

  return errors.length === 0
    ? { gate: "consistency", ok: true }
    : { gate: "consistency", ok: false, errors };
}

// Build the user message that the planner skill receives.
export function buildPlannerInput(requirement: Requirement, draft: DraftInput): string {
  return JSON.stringify({ requirement, draft });
}

// Build the user message that the analyst skill receives.
export function buildAnalystInput(draft: DraftInput): string {
  return JSON.stringify({ draft });
}

export type { Requirement, Story, GateResult, DraftInput } from "./types";
export { RequirementSchema, StorySchema } from "./types";
