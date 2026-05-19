export type FlowDirection = "TD" | "TB" | "LR" | "RL" | "BT";

export type NodeShape = "rect" | "round" | "circle" | "diamond" | "stadium" | "subroutine";

export type FlowNode = {
  id: string;
  label: string;
  shape: NodeShape;
};

export type EdgeKind = "solid" | "dashed" | "thick" | "open";

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: EdgeKind;
};

export type FlowGraph = {
  direction: FlowDirection;
  nodes: FlowNode[];
  edges: FlowEdge[];
};
