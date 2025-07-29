import React, { useRef, useState, useCallback } from "react";
import "./FlowchartBuilder.css";

// Color constants (matches provided theme/colors)
const COLORS = {
  primary: "#1976d2",
  secondary: "#424242",
  accent: "#ffb300",
  nodeBg: "#ffffff",
  nodeBorder: "#1976d2",
  edge: "#1976d2",
  canvas: "#f8f9fa"
};

const NODE_SIZE = { width: 130, height: 55 };

// UTILITIES
const generateId = (() => {
  let id = 0;
  return () => `node-${id++}`;
})();

function getRelativeCoords(e, svgRef) {
  const svgRect = svgRef.current.getBoundingClientRect();
  return {
    x: (e.clientX - svgRect.left),
    y: (e.clientY - svgRect.top)
  };
}

/**
 * Sidebar with node tools
 */
function Sidebar({ onAddNode }) {
  return (
    <div className="sidebar">
      <h3>Tools</h3>
      <button
        className="tool-btn"
        title="Add node"
        onClick={() => onAddNode({ type: "default" })}
      >
        + Node
      </button>
      {/* Add additional node templates here */}
    </div>
  );
}

/**
 * Topbar for main actions
 */
function Topbar({ onSave, onExport, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="topbar">
      <button className="top-btn" onClick={onSave} title="Save (Local)">
        💾 Save
      </button>
      <button className="top-btn" onClick={onExport} title="Export as JSON">
        ⬇️ Export
      </button>
      <button className="top-btn" onClick={onUndo} disabled={!canUndo} title="Undo">
        ↶ Undo
      </button>
      <button className="top-btn" onClick={onRedo} disabled={!canRedo} title="Redo">
        ↷ Redo
      </button>
    </div>
  );
}

/**
 * Node property editor
 */
function NodePropertiesEditor({ node, onChange, onClose }) {
  const [label, setLabel] = useState(node.data.label || "");
  return (
    <div className="node-props-editor">
      <div>
        <label>
          Label:
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            autoFocus
          />
        </label>
      </div>
      <button
        className="mini-btn"
        onClick={() => {
          onChange({ ...node, data: { ...node.data, label } });
          onClose();
        }}
      >
        Save
      </button>
      <button className="mini-btn" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

function getNodeCenter(node) {
  return {
    x: node.position.x + NODE_SIZE.width / 2,
    y: node.position.y + NODE_SIZE.height / 2
  };
}

/**
 * Flowchart main area and logic.
 */
export default function FlowchartBuilder() {
  // Core state for nodes/edges/history
  const [nodes, setNodes] = useState([
    {
      id: generateId(),
      type: "default",
      position: { x: 220, y: 170 },
      data: { label: "Start Node" }
    }
  ]);
  const [edges, setEdges] = useState([]);
  // Selected node or "for connecting"
  const [selectedNode, setSelectedNode] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  // For connect lines
  const [connecting, setConnecting] = useState(null);
  // Undo-redo
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  // Zoom/pan
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const svgRef = useRef();

  /** Add current state to undo history and clear future */
  const pushHistory = () => {
    setHistory(h => [...h, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
    setFuture([]);
  };

  // Undo/Redo
  const handleUndo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture(f => [{ nodes: nodes, edges: edges }, ...f]);
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistory(h => h.slice(0, h.length - 1));
    setSelectedNode(null);
  };
  const handleRedo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory(h => [...h, { nodes: nodes, edges: edges }]);
    setNodes(next.nodes);
    setEdges(next.edges);
    setFuture(f => f.slice(1));
    setSelectedNode(null);
  };

  /** Create a new node at center of canvas (relative to pan/zoom) */
  const handleAddNode = ({ type }) => {
    pushHistory();
    setNodes(n => [
      ...n,
      {
        id: generateId(),
        type,
        position: {
          x: (window.innerWidth * 0.6 - 100 - transform.x) / transform.k,
          y: (window.innerHeight * 0.4 - 50 - transform.y) / transform.k
        },
        data: { label: "New Node" }
      }
    ]);
  };

  /** Drag move node */
  const handleDragNode = (id, dx, dy) => {
    setNodes(n =>
      n.map(node => (node.id === id
        ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
        : node
      ))
    );
  };

  /** Begin connecting from a node */
  const handleStartConnect = (id) => {
    setConnecting(id);
  };

  /** Complete connect to another node */
  const handleCompleteConnect = (targetId) => {
    if (connecting && connecting !== targetId) {
      pushHistory();
      setEdges(e => [...e, { from: connecting, to: targetId, id: `e-${connecting}-${targetId}` }]);
    }
    setConnecting(null);
  };

  // Node mouse state for dragging
  const draggingNode = useRef(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  const handleNodeMouseDown = (e, id) => {
    e.stopPropagation();
    draggingNode.current = id;
    // Calculate offset
    const node = nodes.find(n => n.id === id);
    const mouse = getRelativeCoords(e, svgRef);
    dragStartOffset.current = {
      x: mouse.x / transform.k - node.position.x,
      y: mouse.y / transform.k - node.position.y
    };
    window.addEventListener("mousemove", handleNodeDrag);
    window.addEventListener("mouseup", handleNodeMouseUp);
  };

  const handleNodeDrag = (e) => {
    if (!draggingNode.current) return;
    const mouse = getRelativeCoords(e, svgRef);
    const id = draggingNode.current;
    const { x: offX, y: offY } = dragStartOffset.current;
    const { x, y } = {
      x: mouse.x / transform.k - offX,
      y: mouse.y / transform.k - offY
    };
    setNodes(n =>
      n.map(node =>
        node.id === id
          ? { ...node, position: { x, y } }
          : node
      )
    );
  };

  const handleNodeMouseUp = () => {
    if (!draggingNode.current) return;
    pushHistory();
    draggingNode.current = null;
    window.removeEventListener("mousemove", handleNodeDrag);
    window.removeEventListener("mouseup", handleNodeMouseUp);
  };

  // Pan and zoom logic
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const handleCanvasMouseDown = (e) => {
    if (e.button !== 1 && (e.target === svgRef.current || e.target.classList.contains("canvas-bg"))) {
      panning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, origX: transform.x, origY: transform.y };
      window.addEventListener("mousemove", handleCanvasPanMove);
      window.addEventListener("mouseup", handleCanvasPanEnd);
    }
  };
  const handleCanvasPanMove = (e) => {
    if (!panning.current) return;
    setTransform(tr =>
      ({
        ...tr,
        x: panStart.current.origX + (e.clientX - panStart.current.x),
        y: panStart.current.origY + (e.clientY - panStart.current.y)
      })
    );
  };
  const handleCanvasPanEnd = () => {
    panning.current = false;
    window.removeEventListener("mousemove", handleCanvasPanMove);
    window.removeEventListener("mouseup", handleCanvasPanEnd);
  };
  const handleWheel = (e) => {
    e.preventDefault();
    const scale = Math.max(0.2, Math.min(2.5, transform.k * (e.deltaY < 0 ? 1.08 : 0.92)));
    setTransform(tr => ({ ...tr, k: scale }));
  };

  // Save/export
  const handleSave = () => {
    window.localStorage.setItem("flowchart", JSON.stringify({ nodes, edges }));
    alert("Flowchart saved locally!");
  };
  const handleExport = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "flowchart.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Node property editing
  const handleNodeDoubleClick = (id) => {
    setEditingNode(nodes.find(n => n.id === id));
  };
  const handleNodeUpdate = (updatedNode) => {
    pushHistory();
    setNodes(n =>
      n.map(node =>
        node.id === updatedNode.id ? updatedNode : node
      )
    );
  };

  // Canvas click - clear selections
  const handleCanvasClick = (e) => {
    setSelectedNode(null);
    setEditingNode(null);
    setConnecting(null);
  };

  // Keyboard shortcuts (undo/redo/delete)
  const handleKeyDown = useCallback(
    (e) => {
      if (document.activeElement && document.activeElement.tagName.toLowerCase() === "input")
        return;
      if (e.ctrlKey && e.key === "z") {
        handleUndo();
      } else if (e.ctrlKey && e.key === "y") {
        handleRedo();
      } else if (e.key === "Delete" && selectedNode) {
        pushHistory();
        setNodes(n => n.filter(node => node.id !== selectedNode));
        setEdges(e => e.filter(edge => edge.from !== selectedNode && edge.to !== selectedNode));
        setSelectedNode(null);
      }
    },
    [selectedNode, nodes, edges, history, future]
  );
  React.useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // MAIN RENDER
  return (
    <div className="flowchart-root">
      <Sidebar onAddNode={handleAddNode} />
      <div className="canvas-container">
        <Topbar
          onSave={handleSave}
          onExport={handleExport}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={!!history.length}
          canRedo={!!future.length}
        />
        <svg
          ref={svgRef}
          className="canvas-svg"
          style={{
            background: COLORS.canvas,
            cursor: panning.current ? "grabbing" : "default"
          }}
          width="100%"
          height="100%"
          onMouseDown={handleCanvasMouseDown}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
        >
          <g
            style={{
              transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.k})`
            }}
          >
            {/* Edges/Connections */}
            {edges.map(edge => {
              const from = nodes.find(n => n.id === edge.from);
              const to = nodes.find(n => n.id === edge.to);
              if (!from || !to) return null;
              const p1 = getNodeCenter(from);
              const p2 = getNodeCenter(to);
              return (
                <g key={edge.id} className="edge-group">
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={COLORS.edge}
                    strokeWidth={2.5}
                    markerEnd="url(#arrow)"
                  />
                </g>
              );
            })}
            {/* In-progress connect line */}
            {connecting && (
              <InProgressEdge
                fromNode={nodes.find(n => n.id === connecting)}
                mouse={svgRef}
                transform={transform}
              />
            )}

            {/* Nodes */}
            {nodes.map(node => (
              <g
                key={node.id}
                className={
                  "flow-node" +
                  (selectedNode === node.id ? " selected" : "") +
                  (editingNode && editingNode.id === node.id ? " editing" : "")
                }
                transform={`translate(${node.position.x},${node.position.y})`}
                tabIndex={0}
                onMouseDown={e => handleNodeMouseDown(e, node.id)}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedNode(node.id);
                }}
                onDoubleClick={() => handleNodeDoubleClick(node.id)}
              >
                {/* Node shape */}
                <rect
                  width={NODE_SIZE.width}
                  height={NODE_SIZE.height}
                  rx={12}
                  ry={12}
                  fill={COLORS.nodeBg}
                  stroke={COLORS.nodeBorder}
                  strokeWidth={selectedNode === node.id ? 4 : 2}
                  style={{
                    boxShadow: selectedNode === node.id ? `0 1px 6px ${COLORS.primary}55` : "none",
                    transition: "stroke 0.2s"
                  }}
                />
                {/* Node label */}
                <text
                  x={NODE_SIZE.width / 2}
                  y={NODE_SIZE.height / 2 + 6}
                  textAnchor="middle"
                  fontWeight={600}
                  fontSize={18}
                  fill={COLORS.primary}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {node.data.label || "Node"}
                </text>
                {/* Connect button */}
                <circle
                  className="connect-circle"
                  cx={NODE_SIZE.width - 10}
                  cy={NODE_SIZE.height / 2}
                  r={9}
                  fill={COLORS.accent}
                  style={{ cursor: "crosshair" }}
                  onMouseDown={e => {
                    e.stopPropagation();
                    handleStartConnect(node.id);
                  }}
                  title="Start connection"
                />
              </g>
            ))}
            <defs>
              <marker
                id="arrow"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path
                  d="M0,2 L12,6 L0,10"
                  fill={COLORS.edge}
                  opacity="0.7"
                />
              </marker>
            </defs>
          </g>
          <rect
            className="canvas-bg"
            x="-10000"
            y="-10000"
            width="20000"
            height="20000"
            fill="transparent"
            style={{ pointerEvents: "all" }}
          />
        </svg>
      </div>
      {/* Node editing dialog */}
      {editingNode && (
        <div className="modal">
          <NodePropertiesEditor
            node={editingNode}
            onChange={handleNodeUpdate}
            onClose={() => setEditingNode(null)}
          />
        </div>
      )}
    </div>
  );
}

// Show temp edge as dragging connect
function InProgressEdge({ fromNode, mouse, transform }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  React.useEffect(() => {
    function move(e) {
      const svgRect = mouse.current.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - svgRect.left - transform.x) / transform.k,
        y: (e.clientY - svgRect.top - transform.y) / transform.k
      });
    }
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [mouse, transform]);
  if (!fromNode) return null;
  const start = getNodeCenter(fromNode);
  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={mousePos.x}
      y2={mousePos.y}
      stroke="#1976d2"
      strokeWidth={2.5}
      strokeDasharray="4,3"
      markerEnd="url(#arrow)"
      pointerEvents="none"
      opacity="0.7"
    />
  );
}
