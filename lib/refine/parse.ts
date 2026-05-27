import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";
import { MAX_DESCRIPTION } from "@/lib/subtasks/types";

const Schema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
});

export type RefineResult = { title: string; description: string; acceptanceCriteria: string[] };

export function parseRefineResponse(raw: string): RefineResult {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`refine: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`refine: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const parsed = Schema.parse(json);
  return { title: parsed.title, description: parsed.description.slice(0, MAX_DESCRIPTION), acceptanceCriteria: parsed.acceptanceCriteria };
}
