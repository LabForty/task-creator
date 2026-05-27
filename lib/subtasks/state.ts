import { nanoid } from "nanoid";
import { dedupeLabels } from "@/lib/jira/metadata";
import { type SubTask, type ProposedSubtask, MAX_DESCRIPTION } from "./types";

export function newSubtask(): SubTask {
  return { id: nanoid(), title: "", description: "", labels: [], blocks: [], blockedBy: [] };
}

export function fromProposed(proposed: ProposedSubtask[]): SubTask[] {
  const list: SubTask[] = proposed.map((p) => ({
    id: nanoid(),
    title: p.title,
    description: p.description.slice(0, MAX_DESCRIPTION),
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

export function addSubtask(list: SubTask[]): SubTask[] {
  return [...list, newSubtask()];
}

export function deleteSubtask(list: SubTask[], id: string): SubTask[] {
  return list
    .filter((s) => s.id !== id)
    .map((s) => ({ ...s, blocks: s.blocks.filter((b) => b !== id), blockedBy: s.blockedBy.filter((b) => b !== id) }));
}

export function updateSubtask(
  list: SubTask[],
  id: string,
  patch: Partial<Pick<SubTask, "title" | "description" | "labels">>,
): SubTask[] {
  return list.map((s) =>
    s.id === id
      ? {
          ...s,
          ...patch,
          description: patch.description !== undefined ? patch.description.slice(0, MAX_DESCRIPTION) : s.description,
        }
      : s,
  );
}

export function setLabels(list: SubTask[], id: string, labels: string[]): SubTask[] {
  return updateSubtask(list, id, { labels: dedupeLabels(labels) });
}

export function addLink(list: SubTask[], blockerId: string, blockedId: string): SubTask[] {
  if (blockerId === blockedId) return list;
  return list.map((s) => {
    if (s.id === blockerId) return s.blocks.includes(blockedId) ? s : { ...s, blocks: [...s.blocks, blockedId] };
    if (s.id === blockedId) return s.blockedBy.includes(blockerId) ? s : { ...s, blockedBy: [...s.blockedBy, blockerId] };
    return s;
  });
}

export function removeLink(list: SubTask[], blockerId: string, blockedId: string): SubTask[] {
  return list.map((s) => {
    if (s.id === blockerId) return { ...s, blocks: s.blocks.filter((b) => b !== blockedId) };
    if (s.id === blockedId) return { ...s, blockedBy: s.blockedBy.filter((b) => b !== blockerId) };
    return s;
  });
}
