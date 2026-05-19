import dagre from "@dagrejs/dagre";
import type { FlowEdge, FlowGraph, NodeShape } from "./types";

export type Position = { x: number; y: number };

// Conservative node-size estimates so dagre allocates enough space between
// nodes for the react-flow boxes (with padding + border) to never overlap.
// These match the visual size in <FlowGraphEditor> (`SHAPE_STYLE` + the
// default `padding: "8px 14px"` + `fontSize: 13`).
const NODE_WIDTH = 170;
const NODE_HEIGHT = 56;
const CIRCLE_SIZE = 96;
// Diamonds render as a custom SVG node (see `DiamondNode` in FlowGraphEditor)
// whose bounding box is wider and taller than a plain rectangle, since the
// label sits inside an inscribed rhombus and needs side padding to clear the
// sloped edges. Keep this in sync with `DIAMOND_W` / `DIAMOND_H` there.
const DIAMOND_WIDTH = 180;
const DIAMOND_HEIGHT = 110;

function sizeOf(shape: NodeShape): { width: number; height: number } {
  if (shape === "circle") return { width: CIRCLE_SIZE, height: CIRCLE_SIZE };
  if (shape === "diamond") return { width: DIAMOND_WIDTH, height: DIAMOND_HEIGHT };
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

// Map our FlowDirection to dagre's `rankdir`. dagre uses TB / BT / LR / RL;
// Mermaid's `TD` ("top-down") is the same as dagre's `TB` ("top-to-bottom").
function rankdirFor(direction: FlowGraph["direction"]): "TB" | "BT" | "LR" | "RL" {
  switch (direction) {
    case "TD":
    case "TB":
      return "TB";
    case "BT":
      return "BT";
    case "LR":
      return "LR";
    case "RL":
      return "RL";
  }
}

/**
 * Layered graph layout via dagre. Handles:
 *   - branching (a node with multiple outgoing edges)
 *   - joins (a node with multiple incoming edges)
 *   - cycles (back-edges don't collapse the layout)
 *   - disconnected components
 *
 * dagre returns *centre* coordinates; react-flow expects *top-left*. We
 * subtract half the node's width/height before returning, so the resulting
 * positions slot straight into react-flow's `position` prop without further
 * adjustment.
 *
 * `measuredSizes` (optional) overrides the per-shape size estimate with the
 * actual rendered DOM dimensions react-flow measured. Pass this once react-
 * flow has finished its first measurement pass so dagre can place long-label
 * nodes without overlapping their neighbours.
 */
export function layoutFlow(
  graph: FlowGraph,
  measuredSizes?: Record<string, { width: number; height: number }>,
): Record<string, Position> {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: rankdirFor(graph.direction),
    // Spacing tuned for our node sizes — gives clean separation without
    // wasted whitespace in typical 5-12-node task flows.
    nodesep: 50,
    ranksep: 70,
    marginx: 20,
    marginy: 20,
    // `tight-tree` favours straighter trunks than the default network-simplex
    // ranker for flowcharts with one dominant path and short side branches —
    // which is what AI-generated task flows almost always look like.
    ranker: "tight-tree",
  });
  g.setDefaultEdgeLabel(() => ({}));

  const effectiveSize = (id: string, shape: NodeShape): { width: number; height: number } => {
    const measured = measuredSizes?.[id];
    if (measured && measured.width > 0 && measured.height > 0) return measured;
    return sizeOf(shape);
  };

  for (const n of graph.nodes) {
    g.setNode(n.id, effectiveSize(n.id, n.shape));
  }

  // Order edges deterministically before handing them to dagre. dagre's
  // crossing-minimization uses insertion order as a tie-breaker, so without
  // a stable order the same logical graph can lay out differently depending
  // on which "branch" the AI happened to declare first. Sort each source's
  // outgoing edges by descending subtree depth — this places the "main flow"
  // branch (the one with the longest downstream chain) consistently, and
  // pushes short / dead-end branches off to the side regardless of how the
  // source happened to list them.
  const orderedEdges = sortEdgesByMainFlow(graph.edges);

  for (const e of orderedEdges) {
    // Self-loops don't contribute to layering; let dagre handle the rendering
    // but don't let them distort the rank assignment.
    if (e.source === e.target) continue;
    // Bias the main-flow edge to be drawn as straight as possible. dagre's
    // `weight` makes the edge "cost more" to bend, so a high-weight edge
    // tends to come out vertical (in TB) — keeping the trunk aligned.
    const subtreeWeight = 1 + subtreeDepth(e.target, graph);
    // multigraph=true means we must pass a unique edge name to allow parallel
    // edges between the same pair of nodes (e.g. yes/no branches that both
    // feed back into the same join point).
    g.setEdge(e.source, e.target, { weight: subtreeWeight }, e.id);
  }

  dagre.layout(g);

  // Read raw centre coordinates dagre produced.
  const centre: Record<string, { x: number; y: number }> = {};
  for (const n of graph.nodes) {
    const node = g.node(n.id);
    if (!node) continue;
    centre[n.id] = { x: node.x, y: node.y };
  }

  // ── Post-process: straighten the main trunk. ────────────────────────────
  //
  // dagre minimises edge crossings globally but doesn't know which path is
  // the "trunk" of the flow. The result is layouts that look kinked: the
  // main flow shifts sideways at every diamond. We fix this by finding the
  // longest path in the DAG, picking a canonical axis (median of its centres),
  // and shifting every rank as a UNIT so the trunk lines up. Shifting the
  // rank as a whole — instead of just the trunk node — is what keeps
  // off-trunk siblings (e.g. dead-end branches) the correct nodesep distance
  // from the trunk node; otherwise the trunk slides sideways and crashes
  // into its sibling.
  const isHorizontal = graph.direction === "LR" || graph.direction === "RL";
  const trunk = longestPath(graph);
  if (trunk.length >= 3) {
    const onTrunk = new Set(trunk);
    // Use the median position of trunk nodes as the canonical axis. Median is
    // more stable than mean when a few trunk nodes were placed off-axis.
    const axisValues = trunk
      .map((id) => (isHorizontal ? centre[id]?.y : centre[id]?.x) ?? 0)
      .sort((a, b) => a - b);
    const canonicalAxis = axisValues[Math.floor(axisValues.length / 2)];

    // Group nodes by rank (their dagre cross-axis coordinate — y in TB/BT,
    // x in LR/RL). Nodes at the same rank were laid out together by dagre
    // and must move as a unit to preserve their nodesep gaps.
    const rankKeyOf = (id: string): number =>
      Math.round(isHorizontal ? centre[id].x : centre[id].y);
    const rankBuckets = new Map<number, string[]>();
    for (const n of graph.nodes) {
      if (!centre[n.id]) continue;
      const r = rankKeyOf(n.id);
      const arr = rankBuckets.get(r) ?? [];
      arr.push(n.id);
      rankBuckets.set(r, arr);
    }

    // For each rank, compute the delta needed to bring its trunk node onto
    // the canonical axis, then apply that same delta to every node in the
    // rank. Ranks with no trunk node get the delta of the nearest-by-rank
    // trunk-containing rank (so disconnected subtrees still align sensibly).
    const rankDeltas = new Map<number, number>();
    for (const [rank, ids] of rankBuckets) {
      const trunkInRank = ids.find((id) => onTrunk.has(id));
      if (!trunkInRank) continue;
      const cur = isHorizontal ? centre[trunkInRank].y : centre[trunkInRank].x;
      rankDeltas.set(rank, canonicalAxis - cur);
    }
    // Fall-back deltas for ranks without a trunk node: pick the delta of the
    // numerically closest rank that has one.
    if (rankBuckets.size > rankDeltas.size) {
      const trunkRanks = Array.from(rankDeltas.keys()).sort((a, b) => a - b);
      for (const rank of rankBuckets.keys()) {
        if (rankDeltas.has(rank)) continue;
        let nearest = trunkRanks[0] ?? rank;
        let bestDist = Math.abs(rank - nearest);
        for (const r of trunkRanks) {
          const d = Math.abs(rank - r);
          if (d < bestDist) {
            nearest = r;
            bestDist = d;
          }
        }
        rankDeltas.set(rank, rankDeltas.get(nearest) ?? 0);
      }
    }

    for (const [rank, ids] of rankBuckets) {
      const d = rankDeltas.get(rank) ?? 0;
      if (d === 0) continue;
      for (const id of ids) {
        if (isHorizontal) centre[id].y += d;
        else centre[id].x += d;
      }
    }
  }

  // Translate centre coordinates to react-flow top-left coordinates.
  const out: Record<string, Position> = {};
  for (const n of graph.nodes) {
    const c = centre[n.id];
    if (!c) continue;
    const { width, height } = effectiveSize(n.id, n.shape);
    out[n.id] = {
      x: c.x - width / 2,
      y: c.y - height / 2,
    };
  }
  return out;
}

// Find the longest path in the DAG (any source → any sink). On cycles this
// still terminates because the DFS short-circuits on revisit. The path is
// returned root-first.
function longestPath(graph: FlowGraph): string[] {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    adj.get(e.source)?.push(e.target);
  }
  const memo = new Map<string, string[]>();
  const visiting = new Set<string>();
  const dfs = (id: string): string[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (visiting.has(id)) return [id];
    visiting.add(id);
    let best: string[] = [id];
    for (const next of adj.get(id) ?? []) {
      const candidate = [id, ...dfs(next)];
      if (candidate.length > best.length) best = candidate;
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };
  let best: string[] = [];
  for (const n of graph.nodes) {
    const p = dfs(n.id);
    if (p.length > best.length) best = p;
  }
  return best;
}

// Cached longest-downstream-path length for each node id. Used to weight edges
// and to sort siblings so the "main flow" stays straight.
function subtreeDepth(nodeId: string, graph: FlowGraph): number {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    adj.get(e.source)?.push(e.target);
  }
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const dfs = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let best = 0;
    for (const next of adj.get(id) ?? []) {
      const d = 1 + dfs(next);
      if (d > best) best = d;
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };
  return dfs(nodeId);
}

// Stable insertion order: for each source node, emit outgoing edges in
// descending order of the target's subtree depth. Ties broken by edge
// declaration order so the original Mermaid intent still shows through when
// branches are symmetric.
function sortEdgesByMainFlow(edges: FlowEdge[]): FlowEdge[] {
  // Group by source, preserve original declaration order within each group's
  // tiebreak.
  const bySource = new Map<string, { edge: FlowEdge; declared: number }[]>();
  edges.forEach((e, i) => {
    const arr = bySource.get(e.source) ?? [];
    arr.push({ edge: e, declared: i });
    bySource.set(e.source, arr);
  });

  // Precompute target subtree depths once.
  const fakeGraph: FlowGraph = { direction: "TD", nodes: [], edges };
  // Walk the unique node ids referenced by the edges.
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.source);
    ids.add(e.target);
  }
  for (const id of ids) fakeGraph.nodes.push({ id, label: id, shape: "rect" });
  const depthOf = (id: string) => subtreeDepth(id, fakeGraph);

  const out: FlowEdge[] = [];
  // Walk every source group in declaration-order so edges from different
  // sources keep their relative order.
  const seenSources = new Set<string>();
  for (const e of edges) {
    if (seenSources.has(e.source)) continue;
    seenSources.add(e.source);
    const group = bySource.get(e.source)!;
    group.sort((a, b) => {
      const dd = depthOf(b.edge.target) - depthOf(a.edge.target);
      if (dd !== 0) return dd;
      return a.declared - b.declared;
    });
    for (const item of group) out.push(item.edge);
  }
  return out;
}
