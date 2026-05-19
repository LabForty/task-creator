import type { Diagrams, HelpMessage } from "@/lib/jobs/types";

export type Draft = {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  constraints: string;
  // v2 extensions — optional so v1 drafts hydrate cleanly.
  diagrams?: Diagrams;
  chatHistory?: HelpMessage[];
};

export const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  acceptanceCriteria: [],
  constraints: "",
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
      diagrams: parsed.diagrams,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : undefined,
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
