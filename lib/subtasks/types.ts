// Pure types + constants for generated sub-tasks. No SDK/React.

export type SubTask = {
  id: string;
  title: string;
  description: string;
  labels: string[];
  blocks: string[];     // ids of sub-tasks this one blocks
  blockedBy: string[];  // ids of sub-tasks that block this one
};

// What the AI proposes (blocks are 0-based indices into the proposed array).
export type ProposedSubtask = {
  title: string;
  description: string;
  labels: string[];
  blocks: number[];
};

export const MAX_DESCRIPTION = 1500;
export const MAX_SUBTASKS = 50;
