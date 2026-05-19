import type { EdgeKind, FlowDirection, FlowGraph, FlowNode, NodeShape } from "./types";

/**
 * Parse a Mermaid flowchart source into a structured graph. Forgiving parser
 * that supports a useful subset:
 *
 *   flowchart TD
 *     A[Label]
 *     A --> B
 *     A -->|edge label| C
 *     A -.-> D
 *     B === E
 *     F((Circle)) --- G{Diamond}
 *
 * Returns null if the source doesn't start with `flowchart` / `graph` (e.g. a
 * sequenceDiagram), or if no nodes are found. The caller falls back to the
 * raw text editor for unparseable sources.
 */
export function parseMermaidFlow(source: string): FlowGraph | null {
  const trimmed = source.trim();
  if (!trimmed) return null;

  const headerMatch = trimmed.match(/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i);
  if (!headerMatch) return null;
  const direction = headerMatch[2].toUpperCase() as FlowDirection;

  const body = trimmed.slice(headerMatch[0].length);
  // Tokens are separated by newlines OR by `;` (mermaid statement separator).
  const rawLines = body
    .split(/\r?\n|;/)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

  const nodes = new Map<string, FlowNode>();
  const edges: FlowGraph["edges"] = [];

  for (const line of rawLines) {
    // Skip directives we don't model: classDef, class, style, click, subgraph.
    if (/^(classDef|class|style|click|linkStyle|subgraph|end)\b/.test(line)) continue;
    parseStatement(line, nodes, edges);
  }

  if (nodes.size === 0) return null;

  return {
    direction,
    nodes: Array.from(nodes.values()),
    edges,
  };
}

function stripComment(line: string): string {
  // Mermaid line comments start with `%%`.
  const idx = line.indexOf("%%");
  return idx === -1 ? line : line.slice(0, idx);
}

// Match a node token: optional id followed by an optional shape+label.
// Captures: id, rectLabel, roundLabel, circleLabel, diamondLabel, stadiumLabel, subroutineLabel
const NODE_TOKEN = new RegExp(
  String.raw`([A-Za-z_][\w-]*)` + // id
    `(?:` +
    String.raw`\[\[([^\]]+)\]\]` + // [[subroutine]]
    `|` +
    String.raw`\(\(([^)]+)\)\)` + // ((circle))
    `|` +
    String.raw`\[\/([^/]+)\/\]` + // [/parallelogram/] — treat as rect
    `|` +
    String.raw`\[([^\]]+)\]` + // [rect]
    `|` +
    String.raw`\(\[([^\]]+)\]\)` + // ([stadium])
    `|` +
    String.raw`\(([^)]+)\)` + // (round)
    `|` +
    String.raw`\{([^}]+)\}` + // {diamond}
    `)?`,
);

// Edge operators we support. Order matters: longer first so `-.->` isn't
// eaten by `-->`.
const EDGE_OPS = [
  { op: "-.->", kind: "dashed" as EdgeKind },
  { op: "-.-", kind: "dashed" as EdgeKind },
  { op: "===>", kind: "thick" as EdgeKind },
  { op: "===", kind: "thick" as EdgeKind },
  { op: "==>", kind: "thick" as EdgeKind },
  { op: "-->", kind: "solid" as EdgeKind },
  { op: "---", kind: "open" as EdgeKind },
];

function parseStatement(
  line: string,
  nodes: Map<string, FlowNode>,
  edges: FlowGraph["edges"],
): void {
  let remaining = line;
  let prevNodeId: string | null = null;
  let pendingEdge: { kind: EdgeKind; label: string } | null = null;

  // Cap iterations so a malformed line can't spin forever.
  for (let safety = 0; safety < 32; safety++) {
    remaining = remaining.trim();
    if (!remaining) break;

    // Try to consume a node token.
    const nodeMatch = remaining.match(new RegExp("^" + NODE_TOKEN.source));
    if (nodeMatch) {
      const id = nodeMatch[1];
      // Detect shape based on which capture group matched.
      const groups = nodeMatch.slice(2);
      let label: string | null = null;
      let shape: NodeShape = "rect";
      if (groups[0] !== undefined) {
        // [[subroutine]]
        label = groups[0];
        shape = "subroutine";
      } else if (groups[1] !== undefined) {
        // ((circle))
        label = groups[1];
        shape = "circle";
      } else if (groups[2] !== undefined) {
        // [/parallelogram/]
        label = groups[2];
        shape = "rect";
      } else if (groups[3] !== undefined) {
        // [rect]
        label = groups[3];
        shape = "rect";
      } else if (groups[4] !== undefined) {
        // ([stadium])
        label = groups[4];
        shape = "stadium";
      } else if (groups[5] !== undefined) {
        // (round)
        label = groups[5];
        shape = "round";
      } else if (groups[6] !== undefined) {
        // {diamond}
        label = groups[6];
        shape = "diamond";
      }

      // Upsert node. Once a label/shape is provided anywhere, keep it.
      const existing = nodes.get(id);
      if (!existing) {
        nodes.set(id, {
          id,
          label: label ?? id,
          shape: label !== null ? shape : "rect",
        });
      } else if (label !== null && (existing.label === existing.id || existing.shape === "rect")) {
        nodes.set(id, { id, label, shape });
      }

      // Close any pending edge.
      if (prevNodeId && pendingEdge) {
        edges.push({
          id: `e-${prevNodeId}-${id}-${edges.length}`,
          source: prevNodeId,
          target: id,
          label: pendingEdge.label,
          kind: pendingEdge.kind,
        });
        pendingEdge = null;
      }
      prevNodeId = id;
      remaining = remaining.slice(nodeMatch[0].length);
      continue;
    }

    // Try to consume an edge operator (+ optional label).
    const edge = matchEdge(remaining);
    if (edge) {
      pendingEdge = { kind: edge.kind, label: edge.label };
      remaining = remaining.slice(edge.consumed);
      continue;
    }

    // Unknown token — bail on this line.
    break;
  }
}

function matchEdge(s: string): { kind: EdgeKind; label: string; consumed: number } | null {
  for (const { op, kind } of EDGE_OPS) {
    if (s.startsWith(op)) {
      let consumed = op.length;
      let label = "";
      const rest = s.slice(consumed).trimStart();
      if (rest.startsWith("|")) {
        const end = rest.indexOf("|", 1);
        if (end !== -1) {
          label = rest.slice(1, end);
          consumed += s.length - s.slice(consumed).length + (s.slice(consumed).length - rest.length) + end + 1;
          // Easier: recompute consumed from absolute position.
          consumed = s.length - rest.slice(end + 1).length;
        }
      }
      // Inline-label variant: `-- label -->` (rarely used but valid).
      // Skip; the `|label|` form is handled above. Adding `-- text -->` would
      // require multi-token edge matching.
      return { kind, label, consumed };
    }
  }
  // Inline-label form: `-- text -->` or `-.- text -.->`. Recognize a few.
  const inline = s.match(/^--\s+([^-]+?)\s+-->/);
  if (inline) {
    return { kind: "solid", label: inline[1].trim(), consumed: inline[0].length };
  }
  const inlineDashed = s.match(/^-\.-\s+([^-]+?)\s+-\.->/);
  if (inlineDashed) {
    return { kind: "dashed", label: inlineDashed[1].trim(), consumed: inlineDashed[0].length };
  }
  return null;
}
