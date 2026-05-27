import { z } from "zod";
import { extractJsonObject } from "@/lib/json/extract";

const WarningSchema = z.object({ affectedTaskId: z.string().min(1), reason: z.string().min(1) });

export type RawWarning = z.infer<typeof WarningSchema>;

export function parseInterferenceResponse(raw: string): RawWarning[] {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error(`interference: model output had no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    throw new Error(`interference: model output was not valid JSON. First 200 chars: ${candidate.slice(0, 200)}`);
  }
  const arr = (json as { interference?: unknown }).interference;
  if (!Array.isArray(arr)) return [];
  // Drop malformed items rather than failing the whole analysis.
  return arr.flatMap((item) => {
    const parsed = WarningSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
