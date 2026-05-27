import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";
import { type ProposedSubtask, MAX_DESCRIPTION, MAX_SUBTASKS } from "./types";

export const ProposedSubtaskSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  labels: z.array(z.string()).optional().default([]),
  blocks: z.array(z.number().int()).optional().default([]),
});

const ResponseSchema = z.object({ subtasks: z.array(ProposedSubtaskSchema) });

export function parseSubtasksResponse(raw: string): ProposedSubtask[] {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`subtasks: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`subtasks: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const parsed = ResponseSchema.parse(json);
  const capped = parsed.subtasks.slice(0, MAX_SUBTASKS);
  const n = capped.length;
  return capped.map((s) => ({
    title: s.title,
    description: s.description.slice(0, MAX_DESCRIPTION),
    labels: s.labels,
    blocks: s.blocks.filter((i) => i >= 0 && i < n),
  }));
}
