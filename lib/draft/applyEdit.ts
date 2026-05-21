import type { Draft } from "@/lib/draft/autosave";
import type { ProposedEdit } from "@/lib/jobs/types";

// Apply a ProposedEdit to a Draft and return the new Draft. Pure — does not
// mutate the input. The UI uses this both to render the "after" side of the
// diff preview and to commit when the user clicks Apply.
export function applyEditToDraft(draft: Draft, edit: ProposedEdit): Draft {
  const next: Draft = { ...draft };

  switch (edit.field) {
    case "title": {
      if (typeof edit.value !== "string") return draft;
      next.title = edit.op === "append"
        ? joinProse(draft.title, edit.value)
        : edit.value;
      return next;
    }
    case "description": {
      if (typeof edit.value !== "string") return draft;
      next.description = edit.op === "append"
        ? joinProse(draft.description, edit.value)
        : edit.value;
      return next;
    }
    case "constraints": {
      if (typeof edit.value !== "string") return draft;
      next.constraints = edit.op === "append"
        ? joinProse(draft.constraints, edit.value)
        : edit.value;
      return next;
    }
    case "acceptanceCriteria": {
      if (!Array.isArray(edit.value)) return draft;
      const items = edit.value.map((s) => String(s).trim()).filter(Boolean);
      next.acceptanceCriteria = edit.op === "append"
        ? [...draft.acceptanceCriteria, ...items]
        : items;
      return next;
    }
  }
}

function joinProse(current: string, addition: string): string {
  const cur = current.trim();
  const add = addition.trim();
  if (!cur) return add;
  if (!add) return cur;
  return `${cur}\n\n${add}`;
}

// Pull the current value of the target field from the Draft as a normalized
// representation suitable for diffing. Strings stay strings; arrays become
// one-per-line strings so we can run a line-based diff against the proposed
// value (which is also normalised the same way).
export function fieldAsText(draft: Draft, edit: ProposedEdit): string {
  switch (edit.field) {
    case "title": return draft.title;
    case "description": return draft.description;
    case "constraints": return draft.constraints;
    case "acceptanceCriteria":
      return draft.acceptanceCriteria.join("\n");
  }
}

export function proposedAsText(edit: ProposedEdit, current: Draft): string {
  const after = applyEditToDraft(current, edit);
  return fieldAsText(after, edit);
}

export function fieldLabel(field: ProposedEdit["field"]): string {
  switch (field) {
    case "title": return "Task title";
    case "description": return "Description";
    case "acceptanceCriteria": return "Acceptance criteria";
    case "constraints": return "Pay attention to";
  }
}
