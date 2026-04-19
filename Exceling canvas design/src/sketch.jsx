// Sketch Mode — Miro-like whiteboard with loose rectangles and connector lines.
// Supports drag-to-reposition, add/delete, and "promote to workflow" (parse into structured model).

const { useState: useStateS, useEffect: useEffectS, useRef: useRefS, useMemo: useMemoS, useCallback: useCallbackS } = React;

function SketchCanvas({ scenario, values, onPromote, density, showNarration, colorScheme, operatorDisplay }) {
  const nodes = scenario.nodes;
  const layout = scenario.sketchLayout;
  const edges = useMemoS(() => deriveEdges(nodes), [nodes]);

  const [positions, setPositions] = useStateS(() => ({ ...layout }));
  const [dragging, setDragging] = useStateS(null);
  const [hovered, setHovered] = useStateS(null);
  const [selected, setSelected] = useStateS(null);
  const svgRef = useRefS(null);

  useEffectS(() => {
    setPositions({ ...layout });
  }, [scenario.title]);

  const onMouseDown = (e, id) => {
    const svg = svgRef.current;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const n = positions[id];
    setDragging({ id, dx: pt.x - n.x, dy: pt.y - n.y });
    setSelected(id);
    e.stopPropagation();
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    const svg = svgRef.current;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    setPositions(prev => ({
      ...prev,
      [dragging.id]: { ...prev[dragging.id], x: pt.x - dragging.dx, y: pt.y - dragging.dy },
    }));
  };

  const onMouseUp = () => setDragging(null);

  const viewBox = "0 0 1200 600";

  // rough path generator for hand-drawn edges
  const edgePath = (e) => {
    const s = positions[e.source];
    const t = positions[e.target];
    if (!s || !t) return "";
    const sx = s.x + s.w;
    const sy = s.y + s.h / 2;
    const tx = t.x;
    const ty = t.y + t.h / 2;
    const midx = (sx + tx) / 2;
    // wobbly bezier
    const wob1 = (Math.sin((sx + sy) * 0.01) * 6);
    const wob2 = (Math.cos((tx + ty) * 0.01) * 6);
    return `M ${sx} ${sy} C ${midx + wob1} ${sy + wob2}, ${midx + wob2} ${ty + wob1}, ${tx} ${ty}`;
  };

  const opColor = (op) => {
    if (colorScheme === "mono") return "var(--ink-500)";
    return ({
      "+": "var(--sage)",
      "-": "var(--mauve)",
      "*": "var(--slate)",
      "/": "var(--sand)",
    })[op] || "var(--ink-500)";
  };

  const opWidth = (op) => (op === "*" ? 2 : 1.25);
  const opDash = (op) => {
    if (op === "-") return "5 3";
    return null;
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--ink-0)" }}>
      {/* hatch background */}
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", cursor: dragging ? "grabbing" : "default" }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={() => setSelected(null)}
      >
        <defs>
          <pattern id="sketch-dots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="#E4E4E7" />
          </pattern>
          <filter id="rough">
            <feTurbulence baseFrequency="0.02" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="1.5" />
          </filter>
          <marker id="sk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--ink-500)" />
          </marker>
        </defs>
        <rect x="0" y="0" width="1200" height="600" fill="url(#sketch-dots)" />

        {/* edges */}
        {edges.map(e => {
          const col = opColor(e.op);
          return (
            <g key={e.id} opacity={hovered && hovered !== e.source && hovered !== e.target ? 0.3 : 1}>
              <path
                d={edgePath(e)}
                fill="none"
                stroke={col}
                strokeWidth={opWidth(e.op)}
                strokeDasharray={opDash(e.op)}
                markerEnd="url(#sk-arrow)"
                filter="url(#rough)"
              />
              {operatorDisplay === "edge-label" && (() => {
                const s = positions[e.source];
                const t = positions[e.target];
                if (!s || !t) return null;
                const mx = ((s.x + s.w) + t.x) / 2;
                const my = (s.y + s.h / 2 + t.y + t.h / 2) / 2;
                return (
                  <g transform={`translate(${mx} ${my})`}>
                    <rect x="-10" y="-10" width="20" height="20" rx="3" fill="var(--ink-1000)" opacity="0.92" />
                    <text x="0" y="5" textAnchor="middle" fontSize="13" fontFamily="var(--mono)" fill="var(--ink-0)" fontWeight="600">{opSymbol(e.op)}</text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* nodes */}
        {nodes.map(n => {
          const p = positions[n.id];
          if (!p) return null;
          const v = values[n.id];
          const isSel = selected === n.id;
          const isHover = hovered === n.id;
          const stroke = isSel ? "var(--ink-900)" : isHover ? "var(--ink-400)" : "var(--ink-700)";
          const accent = colorScheme === "mono" ? "var(--ink-700)" : kindColor(n.kind);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              onMouseDown={(e) => onMouseDown(e, n.id)}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "grab" }}
            >
              {/* rough rectangle */}
              <rect
                x="0" y="0"
                width={p.w} height={p.h}
                rx="4" ry="4"
                fill="var(--ink-0)"
                stroke={stroke}
                strokeWidth={isSel ? 1.8 : 1.2}
                filter="url(#rough)"
              />
              {/* accent corner tag */}
              <rect x="0" y="0" width="24" height="4" fill={accent} filter="url(#rough)" />
              {/* kind badge */}
              <text x="10" y="20" fontSize="8.5" fontFamily="var(--sans)" fill="var(--ink-400)" letterSpacing="1.2" fontWeight="600">
                {kindLabel(n.kind)}
              </text>
              {/* label */}
              <text x="10" y="38" fontSize="12" fontFamily="var(--sans)" fill="var(--ink-800)" fontWeight="600">
                {truncate(n.label, 20)}
              </text>
              {/* value */}
              <text x="10" y="58" fontSize="14" fontFamily="var(--mono)" fill="var(--ink-900)" fontWeight="700">
                {fmt(v)}
              </text>
              {n.unit && (
                <text x={p.w - 10} y="58" textAnchor="end" fontSize="10" fontFamily="var(--mono)" fill="var(--ink-400)">
                  {n.unit}
                </text>
              )}
              {n.cell && (
                <text x={p.w - 10} y="18" textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--ink-400)">
                  {n.cell}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* floating toolbar */}
      <div style={{
        position: "absolute", left: 16, top: 16, display: "flex", gap: 8, alignItems: "center",
        padding: "6px 10px", background: "var(--ink-0)", border: "1px solid var(--ink-200)", borderRadius: 6,
      }}>
        <span style={{ fontSize: 11, color: "var(--ink-500)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Sketch</span>
        <span style={{ width: 1, height: 14, background: "var(--ink-200)" }} />
        <span style={{ fontSize: 11, color: "var(--ink-400)", fontFamily: "var(--mono)" }}>{nodes.length} shapes · {edges.length} connectors</span>
      </div>

      <div style={{
        position: "absolute", right: 16, top: 16, display: "flex", gap: 6,
      }}>
        <button
          onClick={onPromote}
          style={{
            height: 32, padding: "0 12px", background: "var(--ink-900)", color: "var(--ink-0)",
            border: "none", borderRadius: 4, fontSize: 12, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          Promote to Workflow →
        </button>
      </div>
    </div>
  );
}

function svgPoint(svg, cx, cy) {
  const pt = svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function opSymbol(op) {
  return op === "*" ? "×" : op === "/" ? "÷" : op === "-" ? "−" : "+";
}

window.SketchCanvas = SketchCanvas;
