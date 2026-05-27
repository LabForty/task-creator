import type { Diagrams, HelpMessage } from "@/lib/jobs/types";
import type { KneadState } from "@/lib/knead/types";
import type { ReviewMap } from "@/lib/review/types";
import type { SubTask } from "@/lib/subtasks/types";
import type { EpicTask } from "@/lib/epic/tasks";

export type Draft = {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  constraints: string;
  // Slug of the selected task-type template (matches a prompts/types/<slug>.md
  // file). Defaults to "story" when missing — see loadDraft.
  taskType: string;
  // v2 extensions — optional so v1 drafts hydrate cleanly.
  diagrams?: Diagrams;
  chatHistory?: HelpMessage[];
  // Epic-mode extensions. mode defaults to "single" for v1 drafts.
  mode: "single" | "epic";
  knead?: KneadState;
  subtasks?: SubTask[];
  epicTasks?: EpicTask[];
  reviewing?: boolean;
  reviews?: ReviewMap;
};

export const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  acceptanceCriteria: [],
  constraints: "",
  taskType: "story",
  mode: "single",
};

const PREFIX = "task-creator:draft:";
const keyOf = (namespace: string) => `${PREFIX}${namespace}`;

export function loadDraft(namespace: string): Draft {
  if (typeof window === "undefined") return { ...EMPTY_DRAFT };
  try {
    const raw = window.localStorage.getItem(keyOf(namespace));
    if (!raw) return { ...EMPTY_DRAFT };
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      title: parsed.title ?? "",
      description: parsed.description ?? "",
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria : [],
      constraints: parsed.constraints ?? "",
      taskType: typeof parsed.taskType === "string" && parsed.taskType.trim() ? parsed.taskType : "story",
      diagrams: parsed.diagrams,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : undefined,
      mode: parsed.mode === "epic" ? "epic" : "single",
      knead: parsed.knead,
      subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : undefined,
      epicTasks: Array.isArray(parsed.epicTasks) ? parsed.epicTasks : undefined,
      reviewing: parsed.reviewing === true ? true : undefined,
      reviews: parsed.reviews && typeof parsed.reviews === "object" ? parsed.reviews : undefined,
    };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function saveDraft(namespace: string, draft: Draft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyOf(namespace), JSON.stringify(draft));
  } catch {
    /* quota or disabled; nothing to do */
  }
}

export function clearDraft(namespace: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(keyOf(namespace));
}

export function isDirty(draft: Draft): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.description.trim() ||
      draft.constraints.trim() ||
      draft.acceptanceCriteria.some((c) => c.trim()),
  );
}
