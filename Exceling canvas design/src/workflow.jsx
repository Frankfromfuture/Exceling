// Workflow Mode — clean structured DAG with auto-layout (BFS levels, left→right).
// Nodes are rectangles per design.md 8.1, edges per 8.2.

const { useState: useStateW, useMemo: useMemoW, useRef: useRefW, useEffect: useEffectW } = React;

function autoLayout(nodes, edges, { nodeW = 180, nodeH = 84, gapX = 72, gapY = 28, density = "comfortable" } = {}) {
  if (density === "compact") { gapX = 48; gapY = 16; nodeW = 160; nodeH = 76; }
  if (density === "spacious") { gapX = 96; gapY = 44; nodeW = 200; nodeH = 96; }
  // compute level per node via longest path from sources
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const incoming = {};
  const outgoing = {};
  nodes.forEach(n => { incoming[n.id] = []; outgoing[n.id] = []; });
  edges.forEach(e => {
    incoming[e.target]?.push(e.source);
    outgoing[e.source]?.push(e.target);
  });
  const level = {};
  const visit = (id, seen = new Set()) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    if (level[id] != null) return level[id];
    const ins = incoming[id];
    if (!ins || ins.length === 0) { level[id] = 0; return 0; }
    level[id] = 1 + Math.max(...ins.map(i => visit(i, seen)));
    return level[id];
  };
  nodes.forEach(n => visit(n.id));
  // group by level
  const levels = {};
  nodes.forEach(n => {
    const l = level[n.id];
    levels[l] = levels[l] || [];
    levels[l].push(n.id);
  });
  const positions = {};
  const levelKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);
  // first pass: compute max column height to center-align each column
  const colHeights = {};
  levelKeys.forEach(l => {
    const col = levels[l];
    col.sort((a, b) => {
      const order = { input: 0, const: 1, computed: 2, output: 3 };
      return (order[byId[a].kind] ?? 2) - (order[byId[b].kind] ?? 2);
    });
    colHeights[l] = col.length * (nodeH + gapY) - gapY;
  });
  const maxColH = Math.max(...Object.values(colHeights));
  levelKeys.forEach(l => {
    const col = levels[l];
    const colH = colHeights[l];
    const yOffset = 40 + (maxColH - colH) / 2;
    col.forEach((id, i) => {
      positions[id] = {
        x: 40 + l * (nodeW + gapX),
        y: yOffset + i * (nodeH + gapY),
        w: nodeW,
        h: nodeH,
      };
    });
  });
  const maxY = Math.max(...Object.values(positions).map(p => p.y + p.h));
  const canvasW = 40 + (levelKeys.length) * (nodeW + gapX);
  const canvasH = maxY + 40;
  return { positions, width: canvasW, height: canvasH, levels, level };
}

function WorkflowCanvas({
  scenario, values, overrides, onOverride, density, showNarration,
  colorScheme, operatorDisplay, highlightPath, setHighlightPath, detailNodeId, setDetailNodeId,
}) {
  const nodes = scenario.nodes;
  const edges = useMemoW(() => deriveEdges(nodes), [nodes]);
  const { positions, width, height } = useMemoW(
    () => autoLayout(nodes, edges, { density }),
    [nodes, edges, density]
  );

  const accentFor = (n) => colorScheme === "mono" ? "var(--ink-700)" : kindColor(n.kind);
  const opColor = (op) => {
    if (colorScheme === "mono") return "var(--ink-500)";
    return ({ "+": "var(--sage)", "-": "var(--mauve)", "*": "var(--slate)", "/": "var(--sand)" })[op] || "var(--ink-500)";
  };
  const opWidth = (op) => (op === "*" ? 2 : 1.25);
  const opDash = (op) => (op === "-" ? "5 3" : null);

  // Compute highlighted path (click an output cell → ancestors)
  const highlightSet = useMemoW(() => {
    if (!highlightPath) return null;
    const set = new Set([highlightPath]);
    const byTarget = {};
    edges.forEach(e => {
      byTarget[e.target] = byTarget[e.target] || [];
      byTarget[e.target].push(e.source);
    });
    const walk = (id) => {
      (byTarget[id] || []).forEach(s => {
        if (!set.has(s)) { set.add(s); walk(s); }
      });
    };
    walk(highlightPath);
    return set;
  }, [highlightPath, edges]);

  const edgePath = (e) => {
    const s = positions[e.source];
    const t = positions[e.target];
    if (!s || !t) return "";
    const sx = s.x + s.w;
    const sy = s.y + s.h / 2;
    const tx = t.x;
    const ty = t.y + t.h / 2;
    const midx = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${midx} ${sy}, ${midx} ${ty}, ${tx} ${ty}`;
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--ink-0)", overflow: "auto" }}>
      <svg
        width={Math.max(width, 900)}
        height={Math.max(height, 500)}
        style={{ minWidth: "100%", minHeight: "100%" }}
      >
        <defs>
          <pattern id="wf-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.5" fill="#F4F4F5" />
          </pattern>
          <marker id="wf-arrow-sage" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--sage)" />
          </marker>
          <marker id="wf-arrow-mauve" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--mauve)" />
          </marker>
          <marker id="wf-arrow-slate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--slate)" />
          </marker>
          <marker id="wf-arrow-sand" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--sand)" />
          </marker>
          <marker id="wf-arrow-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--ink-500)" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#wf-grid)" />

        {/* edges */}
        {edges.map(e => {
          const dim = highlightSet && !(highlightSet.has(e.source) && highlightSet.has(e.target));
          const col = opColor(e.op);
          const marker =
            colorScheme === "mono" ? "url(#wf-arrow-ink)"
            : e.op === "+" ? "url(#wf-arrow-sage)"
            : e.op === "-" ? "url(#wf-arrow-mauve)"
            : e.op === "*" ? "url(#wf-arrow-slate)"
            : "url(#wf-arrow-sand)";
          return (
            <g key={e.id} opacity={dim ? 0.18 : 1}>
              <path
                d={edgePath(e)}
                fill="none"
                stroke={col}
                strokeWidth={opWidth(e.op)}
                strokeDasharray={opDash(e.op)}
                markerEnd={marker}
              />
              {operatorDisplay === "edge-label" && (() => {
                const s = positions[e.source];
                const t = positions[e.target];
                if (!s || !t) return null;
                const mx = ((s.x + s.w) + t.x) / 2;
                const my = (s.y + s.h / 2 + t.y + t.h / 2) / 2;
                return (
                  <g transform={`translate(${mx} ${my})`}>
                    <rect x="-10" y="-9" width="20" height="18" rx="3" fill="var(--ink-1000)" opacity="0.92" />
                    <text x="0" y="4" textAnchor="middle" fontSize="11" fontFamily="var(--mono)" fill="var(--ink-0)" fontWeight="600">{opSym(e.op)}</text>
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
          const accent = accentFor(n);
          const isHighlighted = !highlightSet || highlightSet.has(n.id);
          const isDetail = detailNodeId === n.id;
          const faded = !isHighlighted;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              opacity={faded ? 0.28 : 1}
              style={{ cursor: "pointer" }}
              onClick={() => {
                setDetailNodeId(n.id);
                setHighlightPath(n.id);
              }}
            >
              {/* card */}
              <rect
                x="0" y="0" width={p.w} height={p.h}
                rx="8" ry="8"
                fill={isDetail ? "var(--ink-50)" : "var(--ink-0)"}
                stroke={isDetail ? "var(--ink-900)" : "var(--ink-200)"}
                strokeWidth="1"
              />
              {/* 3px accent bar */}
              <rect x="0" y="0" width="3" height={p.h} fill={accent} />
              {/* kind label */}
              <text x="16" y="18" fontSize="10" fontFamily="var(--sans)" fill="var(--ink-500)" letterSpacing="1.5" fontWeight="600">
                {kindLabel(n.kind)}
              </text>
              {/* cell ref top-right */}
              <text x={p.w - 12} y="18" textAnchor="end" fontSize="10" fontFamily="var(--mono)" fill="var(--ink-400)">
                {n.cell}
              </text>
              {/* label */}
              <text x="16" y="36" fontSize="12" fontFamily="var(--sans)" fill="var(--ink-700)" fontWeight="500">
                {truncateW(n.label, 22)}
              </text>
              {/* value */}
              <text x="16" y={p.h - 22} fontSize={density === "compact" ? 18 : 22} fontFamily="var(--mono)" fill="var(--ink-1000)" fontWeight="700">
                {fmt(v)}
              </text>
              {n.unit && (
                <text x="16" y={p.h - 8} fontSize="10" fontFamily="var(--mono)" fill="var(--ink-400)">
                  {n.unit}
                </text>
              )}
              {/* formula ghost */}
              {n.formula && (
                <text x={p.w - 12} y={p.h - 10} textAnchor="end" fontSize="10" fontFamily="var(--mono)" fill="var(--ink-400)">
                  ƒ {truncateW(n.formula, 18)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* toolbar */}
      <div style={{
        position: "absolute", left: 16, top: 16, display: "flex", gap: 8, alignItems: "center",
        padding: "6px 10px", background: "var(--ink-0)", border: "1px solid var(--ink-200)", borderRadius: 6,
      }}>
        <span style={{ fontSize: 11, color: "var(--ink-500)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Workflow</span>
        <span style={{ width: 1, height: 14, background: "var(--ink-200)" }} />
        <span style={{ fontSize: 11, color: "var(--ink-400)", fontFamily: "var(--mono)" }}>{nodes.length} nodes · {edges.length} edges</span>
      </div>

      {highlightSet && (
        <button
          onClick={() => { setHighlightPath(null); setDetailNodeId(null); }}
          style={{
            position: "absolute", left: 16, bottom: 16,
            height: 28, padding: "0 10px", background: "var(--ink-0)",
            border: "1px solid var(--ink-300)", borderRadius: 4,
            fontSize: 11, fontWeight: 500, color: "var(--ink-700)",
          }}
        >
          Clear focus
        </button>
      )}
    </div>
  );
}

function opSym(op) { return op === "*" ? "×" : op === "/" ? "÷" : op === "-" ? "−" : "+"; }
function truncateW(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

window.WorkflowCanvas = WorkflowCanvas;
window.autoLayout = autoLayout;
