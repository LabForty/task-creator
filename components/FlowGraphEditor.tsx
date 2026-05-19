"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { parseMermaidFlow } from "@/lib/mermaid-flow/parse";
import { serializeMermaidFlow } from "@/lib/mermaid-flow/serialize";
import { layoutFlow } from "@/lib/mermaid-flow/layout";
import type {
  EdgeKind,
  FlowDirection,
  FlowGraph,
  NodeShape,
} from "@/lib/mermaid-flow/types";

type Props = {
  source: string;
  onChange: (next: string) => void;
};

type RFNodeData = {
  label: string;
  shape: NodeShape;
};

type RFEdgeData = {
  label: string;
  kind: EdgeKind;
};

const SHAPE_STYLE: Record<NodeShape, React.CSSProperties> = {
  rect: { borderRadius: 6 },
  round: { borderRadius: 18 },
  stadium: { borderRadius: 999 },
  subroutine: { borderRadius: 4, borderLeftWidth: 4, borderRightWidth: 4 },
  circle: { borderRadius: "50%", width: 80, height: 80 },
  // Diamond is rendered by a custom node type (see `DiamondNode` below), so
  // it doesn't need a CSS shape hack here. The earlier `transform: rotate(45deg)`
  // approach made `getBoundingClientRect()` return the rotated bounding box,
  // which broke both the layout measurements and the hit-test area for drag.
  diamond: {},
};

// Custom node type for diamonds. Renders a real diamond (SVG polygon) so the
// visible shape, react-flow's measurement, and the drag hit-test all share the
// same bounding box. Without this, diamonds rendered via `transform: rotate(45deg)`
// expanded their measured size by ~3× and made adjacent nodes overlap.
const DIAMOND_W = 180;
const DIAMOND_H = 110;

function DiamondNode({ data, sourcePosition, targetPosition }: NodeProps) {
  const label =
    data && typeof (data as { label?: unknown }).label === "string"
      ? ((data as { label: string }).label)
      : "";
  return (
    <div style={{ position: "relative", width: DIAMOND_W, height: DIAMOND_H }}>
      <svg
        width={DIAMOND_W}
        height={DIAMOND_H}
        style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}
      >
        <polygon
          points={`${DIAMOND_W / 2},0 ${DIAMOND_W},${DIAMOND_H / 2} ${DIAMOND_W / 2},${DIAMOND_H} 0,${DIAMOND_H / 2}`}
          fill="#fff"
          stroke="#cbd5e1"
          strokeWidth={1.5}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 28px",
          fontSize: 13,
          textAlign: "center",
          lineHeight: 1.2,
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
      <Handle type="target" position={targetPosition ?? Position.Top} />
      <Handle type="source" position={sourcePosition ?? Position.Bottom} />
    </div>
  );
}

const NODE_TYPES = { diamond: DiamondNode };

function nextId(existing: Set<string>): string {
  // Pick A, B, …, Z, A1, B1, … so generated ids stay short and mermaid-safe.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let suffix = 0; suffix < 1000; suffix++) {
    for (const c of alphabet) {
      const id = suffix === 0 ? c : `${c}${suffix}`;
      if (!existing.has(id)) return id;
    }
  }
  return `N${Date.now()}`;
}

// Map our flow direction to the matching react-flow handle positions, so
// edges leave the right side of a node and enter the left of the next (LR),
// etc. Without this, every edge is forced through the top/bottom default
// handles and the visual looks "wrong" for LR / RL / BT layouts even though
// dagre placed everything correctly.
function handlesFor(direction: FlowDirection): { source: Position; target: Position } {
  switch (direction) {
    case "LR":
      return { source: Position.Right, target: Position.Left };
    case "RL":
      return { source: Position.Left, target: Position.Right };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "TD":
    case "TB":
    default:
      return { source: Position.Bottom, target: Position.Top };
  }
}

function graphToRf(
  graph: FlowGraph,
  positions: Record<string, { x: number; y: number }>,
): { nodes: Node<RFNodeData>[]; edges: Edge<RFEdgeData>[] } {
  const handles = handlesFor(graph.direction);
  const nodes: Node<RFNodeData>[] = graph.nodes.map((n) => {
    const isDiamond = n.shape === "diamond";
    return {
      id: n.id,
      // Diamonds use a custom SVG node (DiamondNode) so the visible shape and
      // measured bounding box agree. Everything else uses react-flow's default.
      type: isDiamond ? "diamond" : "default",
      data: { label: n.label, shape: n.shape },
      position: positions[n.id] ?? { x: 0, y: 0 },
      sourcePosition: handles.source,
      targetPosition: handles.target,
      style: isDiamond
        ? undefined
        : {
            padding: "8px 14px",
            background: "#fff",
            border: "1.5px solid #cbd5e1",
            fontSize: 13,
            ...SHAPE_STYLE[n.shape],
          },
    };
  });
  const edges: Edge<RFEdgeData>[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    // `smoothstep` routes edges as rounded right-angles, which reads better
    // for layered graphs than the bezier default — branches and joins stop
    // looking tangled around dense nodes.
    type: "smoothstep",
    label: e.label,
    data: { label: e.label, kind: e.kind },
    animated: e.kind === "dashed",
    style: {
      strokeDasharray: e.kind === "dashed" ? "5 5" : undefined,
      strokeWidth: e.kind === "thick" ? 2.5 : 1.5,
    },
  }));
  return { nodes, edges };
}

function rfToGraph(
  rfNodes: Node<RFNodeData>[],
  rfEdges: Edge<RFEdgeData>[],
  direction: FlowDirection,
): FlowGraph {
  return {
    direction,
    nodes: rfNodes.map((n) => ({
      id: n.id,
      label: (n.data?.label as string) ?? n.id,
      shape: (n.data?.shape as NodeShape) ?? "rect",
    })),
    edges: rfEdges.map((e, i) => ({
      id: e.id ?? `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: (e.data?.label as string) ?? (typeof e.label === "string" ? e.label : ""),
      kind: (e.data?.kind as EdgeKind) ?? "solid",
    })),
  };
}

function FlowGraphEditorInner({ source, onChange }: Props) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const parsed = useMemo(() => parseMermaidFlow(source), [source]);
  const initialPositions = useMemo(() => (parsed ? layoutFlow(parsed) : {}), [parsed]);

  const [direction, setDirection] = useState<FlowDirection>(parsed?.direction ?? "TD");
  const initial = useMemo(
    () => (parsed ? graphToRf(parsed, initialPositions) : { nodes: [], edges: [] }),
    [parsed, initialPositions],
  );
  const [nodes, setNodes] = useState<Node<RFNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge<RFEdgeData>[]>(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // After react-flow measures every node's real DOM size, re-run dagre with
  // the measured widths/heights and apply the result once. Without this, long
  // labels overflow our estimated 170×56 rectangle and overlap neighbours
  // even though dagre placed the (estimated) boxes correctly. We gate on a
  // ref so this only fires for the initial measurement pass; subsequent user
  // edits keep their explicit positions.
  const measuredLayoutAppliedRef = useRef<string>("");
  const sourceSignature = useMemo(() => {
    if (!parsed) return "";
    return (
      parsed.direction +
      "|" +
      parsed.nodes.map((n) => n.id).join(",") +
      "|" +
      parsed.edges.map((e) => `${e.source}>${e.target}`).join(",")
    );
  }, [parsed]);
  useEffect(() => {
    if (!parsed) return;
    if (!nodesInitialized) return;
    if (measuredLayoutAppliedRef.current === sourceSignature) return;
    // Build a measured graph: use each node's real width/height from react-
    // flow's measurement pass, falling back to the shape estimate if missing.
    const measuredSizes: Record<string, { width: number; height: number }> = {};
    for (const n of nodes) {
      const m = (n as Node & { measured?: { width?: number; height?: number } }).measured;
      if (m && typeof m.width === "number" && typeof m.height === "number") {
        measuredSizes[n.id] = { width: m.width, height: m.height };
      }
    }
    const positions = layoutFlow(parsed, measuredSizes);
    setNodes((prev) =>
      prev.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
    );
    measuredLayoutAppliedRef.current = sourceSignature;
    queueMicrotask(() => fitView({ padding: 0.2, duration: 250 }));
  }, [parsed, nodesInitialized, sourceSignature, nodes, fitView]);

  // Re-hydrate from source if the underlying source actually changes from
  // outside (e.g. regenerate). We compare via the parsed graph's id/edge list
  // signature so a serialize-equivalent source doesn't wipe local positions.
  const lastEmittedRef = useRef<string>("");
  /* eslint-disable react-hooks/set-state-in-effect -- syncing local
     react-flow state to external source-of-truth on regenerate. */
  useEffect(() => {
    if (source === lastEmittedRef.current) return;
    const reparsed = parseMermaidFlow(source);
    if (!reparsed) return;
    setDirection(reparsed.direction);
    const positions = layoutFlow(reparsed);
    const { nodes: n, edges: e } = graphToRf(reparsed, positions);
    setNodes(n);
    setEdges(e);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [source]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Deferred emit: NEVER call onChange from inside a setState updater (React
  // calls those during render, and onChange triggers parent setState which
  // would warn "Cannot update component while rendering"). Instead, queue
  // the emit so it runs after the current render commits.
  const emit = useCallback(
    (n: Node<RFNodeData>[], e: Edge<RFEdgeData>[], dir: FlowDirection) => {
      const next = serializeMermaidFlow(rfToGraph(n, e, dir));
      lastEmittedRef.current = next;
      queueMicrotask(() => onChange(next));
    },
    [onChange],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodes) as Node<RFNodeData>[];
      setNodes(next);
      // Position-only / dimensions / selection changes don't affect Mermaid;
      // only emit on add/remove/replace.
      const meaningful = changes.some(
        (c) => c.type === "remove" || c.type === "add" || c.type === "replace",
      );
      if (meaningful) emit(next, edges, direction);
    },
    [nodes, edges, direction, emit],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, edges) as Edge<RFEdgeData>[];
      setEdges(next);
      const meaningful = changes.some(
        (c) => c.type === "remove" || c.type === "add" || c.type === "replace",
      );
      if (meaningful) emit(nodes, next, direction);
    },
    [nodes, edges, direction, emit],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge<RFEdgeData> = {
        id: `e-${params.source}-${params.target}-${edges.length}`,
        source: params.source!,
        target: params.target!,
        data: { label: "", kind: "solid" },
      };
      const next = addEdge(newEdge, edges) as Edge<RFEdgeData>[];
      setEdges(next);
      emit(nodes, next, direction);
    },
    [nodes, edges, direction, emit],
  );

  const addNode = useCallback(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const id = nextId(ids);
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0);
    const newNode: Node<RFNodeData> = {
      id,
      type: "default",
      data: { label: `New ${id}`, shape: "rect" },
      position: { x: 80, y: maxY + 120 },
      style: {
        padding: "8px 14px",
        background: "#fff",
        border: "1.5px solid #cbd5e1",
        fontSize: 13,
        ...SHAPE_STYLE.rect,
      },
    };
    const next = [...nodes, newNode];
    setNodes(next);
    emit(next, edges, direction);
    setSelectedNodeId(id);
  }, [nodes, edges, direction, emit]);

  const deleteSelected = useCallback(() => {
    if (selectedNodeId) {
      const nextNodes = nodes.filter((n) => n.id !== selectedNodeId);
      const nextEdges = edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      );
      setNodes(nextNodes);
      setEdges(nextEdges);
      emit(nextNodes, nextEdges, direction);
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      const nextEdges = edges.filter((e) => e.id !== selectedEdgeId);
      setEdges(nextEdges);
      emit(nodes, nextEdges, direction);
      setSelectedEdgeId(null);
    }
  }, [selectedNodeId, selectedEdgeId, nodes, edges, direction, emit]);

  // The "rename" input is part of the inspector — typing there mutates the
  // selected node's data and re-emits.
  const renameSelectedNode = useCallback(
    (label: string) => {
      if (!selectedNodeId) return;
      const next = nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...n.data, label } } : n,
      );
      setNodes(next);
      emit(next, edges, direction);
    },
    [selectedNodeId, nodes, edges, direction, emit],
  );

  const setSelectedShape = useCallback(
    (shape: NodeShape) => {
      if (!selectedNodeId) return;
      const isDiamond = shape === "diamond";
      const next = nodes.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              type: isDiamond ? "diamond" : "default",
              data: { ...n.data, shape },
              style: isDiamond
                ? undefined
                : {
                    padding: "8px 14px",
                    background: "#fff",
                    border: "1.5px solid #cbd5e1",
                    fontSize: 13,
                    ...SHAPE_STYLE[shape],
                  },
            }
          : n,
      );
      setNodes(next);
      emit(next, edges, direction);
    },
    [selectedNodeId, nodes, edges, direction, emit],
  );

  const setSelectedEdgeLabel = useCallback(
    (label: string) => {
      if (!selectedEdgeId) return;
      const next = edges.map((e) =>
        e.id === selectedEdgeId ? { ...e, label, data: { ...e.data, label } as RFEdgeData } : e,
      );
      setEdges(next);
      emit(nodes, next, direction);
    },
    [selectedEdgeId, nodes, edges, direction, emit],
  );

  const setSelectedEdgeKind = useCallback(
    (kind: EdgeKind) => {
      if (!selectedEdgeId) return;
      const next = edges.map((e) =>
        e.id === selectedEdgeId
          ? {
              ...e,
              data: { ...(e.data ?? { label: "" }), kind } as RFEdgeData,
              animated: kind === "dashed",
              style: {
                strokeDasharray: kind === "dashed" ? "5 5" : undefined,
                strokeWidth: kind === "thick" ? 2.5 : 1.5,
              },
            }
          : e,
      );
      setEdges(next);
      emit(nodes, next, direction);
    },
    [selectedEdgeId, nodes, edges, direction, emit],
  );

  const changeDirection = useCallback(
    (d: FlowDirection) => {
      setDirection(d);
      // Re-layout for the new rankdir AND swap node handles so edges leave/
      // enter the correct sides. Without the handle swap, LR/RL/BT layouts
      // route every edge through the top/bottom default handles and look
      // tangled even though node positions are correct.
      const graph = rfToGraph(nodes, edges, d);
      const measuredSizes: Record<string, { width: number; height: number }> = {};
      for (const n of nodes) {
        const m = (n as Node & { measured?: { width?: number; height?: number } }).measured;
        if (m && typeof m.width === "number" && typeof m.height === "number") {
          measuredSizes[n.id] = { width: m.width, height: m.height };
        }
      }
      const pos = layoutFlow(graph, measuredSizes);
      const handles = handlesFor(d);
      const nextNodes = nodes.map((n) => ({
        ...n,
        position: pos[n.id] ?? n.position,
        sourcePosition: handles.source,
        targetPosition: handles.target,
      }));
      setNodes(nextNodes);
      emit(nextNodes, edges, d);
      // Recentre the viewport on the next frame so dagre's new bounding box
      // is fully visible.
      queueMicrotask(() => fitView({ padding: 0.2, duration: 250 }));
    },
    [nodes, edges, emit, fitView],
  );

  const relayout = useCallback(() => {
    const graph = rfToGraph(nodes, edges, direction);
    // Use react-flow's measured node sizes so the layout respects each node's
    // actual rendered width (long labels included). Falls back to the shape
    // estimate when a node hasn't been measured yet.
    const measuredSizes: Record<string, { width: number; height: number }> = {};
    for (const n of nodes) {
      const m = (n as Node & { measured?: { width?: number; height?: number } }).measured;
      if (m && typeof m.width === "number" && typeof m.height === "number") {
        measuredSizes[n.id] = { width: m.width, height: m.height };
      }
    }
    const pos = layoutFlow(graph, measuredSizes);
    const handles = handlesFor(direction);
    setNodes((prev) =>
      prev.map((n) =>
        pos[n.id]
          ? {
              ...n,
              position: pos[n.id],
              sourcePosition: handles.source,
              targetPosition: handles.target,
            }
          : n,
      ),
    );
    queueMicrotask(() => fitView({ padding: 0.2, duration: 250 }));
  }, [nodes, edges, direction, fitView]);

  // Keyboard delete handling. react-flow has its own, but it only deletes
  // single elements; we also want to trigger from our explicit button.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Don't delete the diagram while the user is editing an input or textarea
      // (e.g. the rename field on the right).
      const tgt = ev.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) {
        return;
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selectedNodeId || selectedEdgeId) {
          ev.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, selectedNodeId, selectedEdgeId]);

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;

  if (!parsed) {
    return (
      <div className="rounded-md bg-warning/10 border border-warning/40 p-3 text-hig-footnote">
        This diagram isn&apos;t a parseable Mermaid <code>flowchart</code> — the text editor below
        is still available. (Sequence and interaction diagrams use the text editor; only the flow
        view supports graphical editing.)
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_220px] gap-3 h-full min-h-0">
      <div className="rounded-md border border-rule bg-surface min-h-[340px] h-full overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => {
            setSelectedNodeId(n.id);
            setSelectedEdgeId(null);
          }}
          onEdgeClick={(_, e) => {
            setSelectedEdgeId(e.id);
            setSelectedNodeId(null);
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={null}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      <aside className="flex flex-col gap-3 text-hig-footnote min-h-0 overflow-auto">
        <div className="flex flex-col gap-1.5">
          <span className="hig-section-label">Layout</span>
          <div className="flex flex-wrap gap-1.5">
            {(["TD", "LR", "BT", "RL"] as FlowDirection[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => changeDirection(d)}
                className={
                  "h-7 px-2.5 rounded-md text-hig-caption font-medium border " +
                  (direction === d
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-ink border-rule hover:bg-surface-muted")
                }
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1">
            <Button type="button" size="sm" variant="secondary" onClick={addNode}>
              + Node
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={relayout}>
              Relayout
            </Button>
          </div>
        </div>

        {selectedNode && (
          <div className="flex flex-col gap-1.5">
            <span className="hig-section-label">Node · {selectedNode.id}</span>
            <input
              value={selectedNode.data.label}
              onChange={(e) => renameSelectedNode(e.target.value)}
              className="h-8 px-2 rounded-md border border-rule bg-surface text-hig-footnote focus:outline-none focus:border-accent"
              placeholder="Label"
            />
            <select
              value={selectedNode.data.shape}
              onChange={(e) => setSelectedShape(e.target.value as NodeShape)}
              className="h-8 px-2 rounded-md border border-rule bg-surface text-hig-footnote focus:outline-none focus:border-accent"
            >
              <option value="rect">Rect [ ]</option>
              <option value="round">Round ( )</option>
              <option value="stadium">Stadium ([ ])</option>
              <option value="subroutine">Subroutine [[ ]]</option>
              <option value="circle">Circle (( ))</option>
              <option value="diamond">Diamond {"{ }"}</option>
            </select>
            <Button type="button" size="sm" variant="ghost" onClick={deleteSelected}>
              Delete node
            </Button>
          </div>
        )}

        {selectedEdge && (
          <div className="flex flex-col gap-1.5">
            <span className="hig-section-label">Edge</span>
            <span className="text-ink-secondary">
              {selectedEdge.source} → {selectedEdge.target}
            </span>
            <input
              value={(selectedEdge.data?.label as string) ?? ""}
              onChange={(e) => setSelectedEdgeLabel(e.target.value)}
              className="h-8 px-2 rounded-md border border-rule bg-surface text-hig-footnote focus:outline-none focus:border-accent"
              placeholder="Edge label (optional)"
            />
            <select
              value={(selectedEdge.data?.kind as EdgeKind) ?? "solid"}
              onChange={(e) => setSelectedEdgeKind(e.target.value as EdgeKind)}
              className="h-8 px-2 rounded-md border border-rule bg-surface text-hig-footnote focus:outline-none focus:border-accent"
            >
              <option value="solid">Solid →</option>
              <option value="dashed">Dashed ⇢</option>
              <option value="thick">Thick ⇒</option>
              <option value="open">Open (no arrow)</option>
            </select>
            <Button type="button" size="sm" variant="ghost" onClick={deleteSelected}>
              Delete edge
            </Button>
          </div>
        )}

        {!selectedNode && !selectedEdge && (
          <p className="text-ink-tertiary leading-snug">
            Click a node or edge to edit. Drag from a node&apos;s edge to another node to connect.
            Press <kbd className="px-1 rounded bg-surface-muted">⌫</kbd> to delete the selection.
          </p>
        )}
      </aside>
    </div>
  );
}

export function FlowGraphEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}
