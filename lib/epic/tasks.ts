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
};

export const epicTaskNamespace = (id: string) => `standalone:epic:${id}`;
