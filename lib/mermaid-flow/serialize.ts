import type { EdgeKind, FlowGraph, NodeShape } from "./types";

/**
 * Serialize a FlowGraph back into Mermaid flowchart source. We:
 *   - declare each node once with its shape + label
 *   - emit each edge using bare ids (labels already declared)
 *
 * The output is deterministic for a given graph (nodes/edges in their input
 * order) so round-tripping doesn't cause spurious diffs.
 */
export function serializeMermaidFlow(graph: FlowGraph): string {
  const lines: string[] = [`flowchart ${graph.direction}`];
  for (const n of graph.nodes) {
    lines.push(`  ${n.id}${shapeOpenClose(n.shape, n.label)}`);
  }
  for (const e of graph.edges) {
    const op = edgeOp(e.kind);
    const label = e.label.trim() ? `|${escapeLabel(e.label)}|` : "";
    lines.push(`  ${e.source} ${op}${label} ${e.target}`);
  }
  return lines.join("\n");
}

function shapeOpenClose(shape: NodeShape, label: string): string {
  const safe = escapeLabel(label);
  switch (shape) {
    case "rect":
      return `[${safe}]`;
    case "round":
      return `(${safe})`;
    case "circle":
      return `((${safe}))`;
    case "diamond":
      return `{${safe}}`;
    case "stadium":
      return `([${safe}])`;
    case "subroutine":
      return `[[${safe}]]`;
  }
}

function edgeOp(kind: EdgeKind): string {
  switch (kind) {
    case "solid":
      return "-->";
    case "dashed":
      return "-.->";
    case "thick":
      return "==>";
    case "open":
      return "---";
  }
}

function escapeLabel(label: string): string {
  // Mermaid labels with special chars need quotes. Quote when label contains
  // any of: `[]{}()|<>` or starts/ends with whitespace.
  const needsQuote = /["\[\]{}()|<>]|^\s|\s$/.test(label);
  if (!needsQuote) return label;
  return `"${label.replace(/"/g, "&quot;")}"`;
}
