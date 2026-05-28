import { nanoid } from "nanoid";
import { dedupeLabels } from "@/lib/jira/metadata";
import type { ProposedSubtask } from "@/lib/subtasks/types";
import { MAX_DESCRIPTION } from "@/lib/subtasks/types";

// Lightweight ordered descriptors for an epic's sub-tasks. The editable
// content (title/description/AC/constraints/taskType) lives in each task's own
// Editor draft at namespace `standalone:epic:<id>`; `title` here is a mirror
// for tab/nav labels only. Pure — no SDK/React.
export type EpicTask = {
  id: string;
  title: string;
  labels: string[];
  blocks: string[];
  blockedBy: string[];
  // SP4: created Jira issue key + URL after a successful batch upload.
  // Persisted alongside the descriptor in the standalone draft.
  uploadedIssueKey?: string;
  uploadedIssueUrl?: string;
};

export const epicTaskNamespace = (id: string) => `standalone:epic:${id}`;

export function newEpicTask(): EpicTask {
  return { id: nanoid(), title: "", labels: [], blocks: [], blockedBy: [] };
}

export function addEpicTask(list: EpicTask[]): EpicTask[] {
  return [...list, newEpicTask()];
}

export function deleteEpicTask(list: EpicTask[], id: string): EpicTask[] {
  return list
    .filter((t) => t.id !== id)
    .map((t) => ({ ...t, blocks: t.blocks.filter((b) => b !== id), blockedBy: t.blockedBy.filter((b) => b !== id) }));
}

export function setTitle(list: EpicTask[], id: string, title: string): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, title } : t));
}

export function setLabels(list: EpicTask[], id: string, labels: string[]): EpicTask[] {
  return list.map((t) => (t.id === id ? { ...t, labels: dedupeLabels(labels) } : t));
}

export function addLink(list: EpicTask[], blockerId: string, blockedId: string): EpicTask[] {
  if (blockerId === blockedId) return list;
  return list.map((t) => {
    if (t.id === blockerId) return t.blocks.includes(blockedId) ? t : { ...t, blocks: [...t.blocks, blockedId] };
    if (t.id === blockedId) return t.blockedBy.includes(blockerId) ? t : { ...t, blockedBy: [...t.blockedBy, blockerId] };
    return t;
  });
}

export function removeLink(list: EpicTask[], blockerId: string, blockedId: string): EpicTask[] {
  return list.map((t) => {
    if (t.id === blockerId) return { ...t, blocks: t.blocks.filter((b) => b !== blockedId) };
    if (t.id === blockedId) return { ...t, blockedBy: t.blockedBy.filter((b) => b !== blockerId) };
    return t;
  });
}

export type ProposedSeed = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
};

export function descriptorsFromProposed(proposed: ProposedSubtask[]): EpicTask[] {
  const list: EpicTask[] = proposed.map((p) => ({
    id: nanoid(),
    title: p.title,
    labels: dedupeLabels(p.labels),
    blocks: [],
    blockedBy: [],
  }));
  proposed.forEach((p, i) => {
    for (const idx of p.blocks) {
      if (idx === i || idx < 0 || idx >= list.length) continue;
      const blockerId = list[i].id;
      const blockedId = list[idx].id;
      if (!list[i].blocks.includes(blockedId)) list[i].blocks.push(blockedId);
      if (!list[idx].blockedBy.includes(blockerId)) list[idx].blockedBy.push(blockerId);
    }
  });
  return list;
}

export function seedsFromProposed(proposed: ProposedSubtask[], descriptors: EpicTask[]): ProposedSeed[] {
  return descriptors.map((d, i) => ({
    id: d.id,
    title: d.title,
    description: (proposed[i]?.description ?? "").slice(0, MAX_DESCRIPTION),
    acceptanceCriteria: proposed[i]?.acceptanceCriteria ?? [],
  }));
}
