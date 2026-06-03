import { EMPTY_DRAFT, type Draft } from "@/lib/draft/autosave";
import { EMPTY_KNEAD, type KneadState } from "@/lib/knead/types";
import type { EpicTask } from "@/lib/epic/tasks";
import type { HelpMessage } from "@/lib/jobs/types";

export type EpicDraftPayload = Partial<Draft> & {
  mode: "epic";
  knead?: KneadState;
  epicTasks?: EpicTask[];
  subtaskDrafts?: Record<string, Draft>;
};

// Assemble the full epic snapshot for the server payload. `base` is the
// epic-level editor draft (title/description); subtaskDrafts is the map already
// read from each `standalone:epic:<id>` namespace.
export function buildEpicDraftPayload(
  base: Draft,
  knead: KneadState,
  epicTasks: EpicTask[],
  subtaskDrafts: Record<string, Draft>,
): EpicDraftPayload {
  return { ...base, mode: "epic", knead, epicTasks, subtaskDrafts };
}

export type AppliedEpicDraft = {
  mainDraft: Draft;
  knead: KneadState;
  epicTasks: EpicTask[];
  subtaskDrafts: Record<string, Draft>;
  analyzeChatById: Record<string, HelpMessage[]>;
};

// Turn a stored epic payload back into the data the component needs to hydrate:
// the main NAMESPACE draft, knead/epicTasks state, the per-namespace subtask
// drafts to write, and the per-task chat threads.
export function applyEpicDraft(payload: Partial<Draft>): AppliedEpicDraft {
  const knead = (payload.knead as KneadState | undefined) ?? EMPTY_KNEAD;
  const epicTasks = (payload.epicTasks as EpicTask[] | undefined) ?? [];
  const subtaskDrafts = payload.subtaskDrafts ?? {};
  const mainDraft: Draft = { ...EMPTY_DRAFT, ...payload, mode: "epic", knead, epicTasks };
  const analyzeChatById: Record<string, HelpMessage[]> = {};
  for (const t of epicTasks) {
    const chat = subtaskDrafts[t.id]?.chatHistory;
    if (chat && chat.length > 0) analyzeChatById[t.id] = chat;
  }
  return { mainDraft, knead, epicTasks, subtaskDrafts, analyzeChatById };
}

// Epic draft is deleted when the upload sheet closes after >=1 task uploaded.
// (Uploaded tasks already persist their issue key in Jira; a pure cancel with
// zero uploads keeps the draft.)
export function shouldDeleteEpicDraftOnClose(
  draftId: string | null,
  epicTasks: EpicTask[],
): boolean {
  if (!draftId) return false;
  return epicTasks.some((t) => Boolean(t.uploadedIssueKey));
}
