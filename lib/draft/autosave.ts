import type { Diagrams, HelpMessage } from "@/lib/jobs/types";
import type { KneadState } from "@/lib/knead/types";
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
  epicTasks?: EpicTask[];
  // Bundled per-subtask drafts, keyed by epic task id. Populated only in the
  // server payload for epic drafts; the live local store keeps subtasks in
  // their own `standalone:epic:<id>` namespaces.
  subtaskDrafts?: Record<string, Draft>;
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
      epicTasks: Array.isArray(parsed.epicTasks) ? parsed.epicTasks : undefined,
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

// Which server draft the local draft belongs to (AI-50). Persisted alongside
// the draft so saves across page reloads PATCH the same server row instead of
// POSTing a duplicate every visit.
const ID_PREFIX = "task-creator:draft-id:";
const idKeyOf = (namespace: string) => `${ID_PREFIX}${namespace}`;

export function loadDraftId(namespace: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(idKeyOf(namespace));
  } catch {
    return null;
  }
}

export function saveDraftId(namespace: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(idKeyOf(namespace), id);
  } catch {
    /* quota or disabled; nothing to do */
  }
}

export function clearDraftId(namespace: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(idKeyOf(namespace));
}

export function isDirty(draft: Draft): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.description.trim() ||
      draft.constraints.trim() ||
      draft.acceptanceCriteria.some((c) => c.trim()),
  );
}
