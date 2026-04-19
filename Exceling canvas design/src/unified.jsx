// Unified Canvas — sketch aesthetic + workflow clarity merged into one.
// Rule: Only inputs/outputs + key computed intermediates get cards.
// Constants (multipliers, rates, subtrahends) collapse INTO edge labels with their operator.

const { useState: useStateU, useMemo: useMemoU, useRef: useRefU, useEffect: useEffectU, useCallback: useCallbackU } = React;

// Simplify model: absorb "const" nodes into the edges that consume them.
// A "const consumer" is any computed node whose formula includes exactly one const-id
// via a straightforward operator. The const becomes an edge label like "× 0.42".
function simplifyGraph(nodes) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const consts = nodes.filter(n => n.kind === "const");
  const constIds = new Set(consts.map(c => c.id));

  // For each non-const node, compute primary upstream edges
  const primaryNodes = nodes.filter(n => n.kind !== "const");
  const primaryIds = new Set(primaryNodes.map(n => n.id));

  // For each computed/output node, parse formula to produce edges
  // Each edge can carry: op (+/-/*/÷) and an optional constLabel (e.g. "× 0.42 · COGS Rate")
  const edges = [];

  primaryNodes.forEach(n => {
    if (!n.formula) return;
    // normalize formula: tokenize into terms joined by +/-, each term is product chain
    const f = n.formula;
    // Find variable identifiers with their preceding operator context
    const tokenRe = /([+\-*/()])|([a-z_][a-z0-9_]*)|(\d+\.?\d*)/gi;
    const tokens = [];
    let m;
    while ((m = tokenRe.exec(f)) !== null) {
      if (m[1]) tokens.push({ type: "op", val: m[1] });
      else if (m[2]) tokens.push({ type: "id", val: m[2] });
      else tokens.push({ type: "num", val: parseFloat(m[3]) });
    }

    // Walk tokens: for each id token that is a primary node, record an edge
    // Also collect const-labels and operators around each primary token
    let depth = 0;
    let lastTopOp = "+"; // operator at depth 0 before current top-level term
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === "op" && t.val === "(") { depth++; continue; }
      if (t.type === "op" && t.val === ")") { depth--; continue; }
      if (t.type === "op" && depth === 0 && (t.val === "+" || t.val === "-")) {
        lastTopOp = t.val;
        continue;
      }
      if (t.type === "id" && primaryIds.has(t.val)) {
        // Walk forward to collect multiplicative constants until we hit + / - at same depth or end
        const consts = [];
        let j = i + 1;
        let d = depth;
        while (j < tokens.length) {
          const tj = tokens[j];
          if (tj.type === "op" && tj.val === "(") { d++; j++; continue; }
          if (tj.type === "op" && tj.val === ")") { d--; if (d < depth) break; j++; continue; }
          if (tj.type === "op" && d === depth && (tj.val === "+" || tj.val === "-")) break;
          if (tj.type === "op" && (tj.val === "*" || tj.val === "/")) {
            const opHere = tj.val;
            // next should be id or num
            let k = j + 1;
            // Skip optional "(1 -" pattern used for tax_rate: operating * (1 - tax_rate)
            if (tokens[k]?.type === "op" && tokens[k].val === "(") {
              // try to detect "(1 - rate)" or "(1 + rate)" pattern
              if (tokens[k+1]?.type === "num" && tokens[k+2]?.type === "op" &&
                  (tokens[k+2].val === "-" || tokens[k+2].val === "+") &&
                  tokens[k+3]?.type === "id" && constIds.has(tokens[k+3].val) &&
                  tokens[k+4]?.type === "op" && tokens[k+4].val === ")") {
                const c = byId[tokens[k+3].val];
                const sign = tokens[k+2].val;
                consts.push({
                  opSymbol: opHere === "*" ? "×" : "÷",
                  rawOp: opHere,
                  wrap: sign === "-" ? "(1 −" : "(1 +",
                  constId: c.id,
                  constLabel: c.label,
                });
                j = k + 5;
                continue;
              }
            }
            if (tokens[k]?.type === "id" && constIds.has(tokens[k].val)) {
              const c = byId[tokens[k].val];
              consts.push({
                opSymbol: opHere === "*" ? "×" : "÷",
                rawOp: opHere,
                constId: c.id,
                constLabel: c.label,
              });
              j = k + 1;
              continue;
            }
            if (tokens[k]?.type === "num") {
              consts.push({
                opSymbol: opHere === "*" ? "×" : "÷",
                rawOp: opHere,
                num: tokens[k].val,
              });
              j = k + 1;
              continue;
            }
            j = k;
            continue;
          }
          j++;
        }

        edges.push({
          id: `${t.val}->${n.id}:${i}`,
          source: t.val,
          target: n.id,
          op: lastTopOp, // primary join operator (+ or -)
          modifiers: consts,
        });
      }
    }
  });

  return { primaryNodes, edges, constIds };
}

// Compute smart positions: left-to-right DAG with vertical centering. Rough offsets for sketch feel.
function unifiedLayout(primaryNodes, edges, { density = "comfortable" } = {}) {
  let nodeW = 168, nodeH = 82, gapX = 96, gapY = 40;
  if (density === "compact") { nodeW = 148; nodeH = 74; gapX = 64; gapY = 24; }
  if (density === "spacious") { nodeW = 200; nodeH = 96; gapX = 128; gapY = 56; }

  const incoming = {}; const outgoing = {};
  primaryNodes.forEach(n => { incoming[n.id] = []; outgoing[n.id] = []; });
  edges.forEach(e => {
    if (incoming[e.target]) incoming[e.target].push(e.source);
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
  });

  const level = {};
  const visit = (id, seen = new Set()) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    if (level[id] != null) return level[id];
    const ins = incoming[id] || [];
    if (ins.length === 0) { level[id] = 0; return 0; }
    level[id] = 1 + Math.max(...ins.map(i => visit(i, seen)));
    return level[id];
  };
  primaryNodes.forEach(n => visit(n.id));

  const levels = {};
  primaryNodes.forEach(n => {
    levels[level[n.id]] = levels[level[n.id]] || [];
    levels[level[n.id]].push(n.id);
  });

  const keys = Object.keys(levels).map(Number).sort((a,b)=>a-b);
  const colH = {};
  keys.forEach(l => { colH[l] = levels[l].length * (nodeH + gapY) - gapY; });
  const maxH = Math.max(...Object.values(colH));

  // sketch-style jitter for each position (stable per id hash)
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h<<5)-h+s.charCodeAt(i))|0; return h; };

  const positions = {};
  keys.forEach(l => {
    const col = levels[l];
    const yOff = 40 + (maxH - colH[l]) / 2;
    col.forEach((id, i) => {
      const jx = (hash(id) % 9) - 4;
      const jy = (hash(id+"y") % 9) - 4;
      positions[id] = {
        x: 40 + l * (nodeW + gapX) + jx,
        y: yOff + i * (nodeH + gapY) + jy,
        w: nodeW,
        h: nodeH,
      };
    });
  });

  const canvasW = 40 + keys.length * (nodeW + gapX);
  const canvasH = maxH + 80;
  return { positions, width: canvasW, height: canvasH };
}

// -------- Operator picker catalog (9 ops in a fan) --------
const OP_CATALOG = [
  { op: "+", label: "Add",       glyph: "+", needsK: true,  apply: (a,k) => a + k,            fText: (src, k) => `${src} + ${k}`,            name: "Sum" },
  { op: "-", label: "Subtract",  glyph: "−", needsK: true,  apply: (a,k) => a - k,            fText: (src, k) => `${src} − ${k}`,            name: "Difference" },
  { op: "*", label: "Multiply",  glyph: "×", needsK: true,  apply: (a,k) => a * k,            fText: (src, k) => `${src} × ${k}`,            name: "Product" },
  { op: "/", label: "Divide",    glyph: "÷", needsK: true,  apply: (a,k) => k === 0 ? 0 : a/k, fText: (src, k) => `${src} ÷ ${k}`,           name: "Quotient" },
  { op: "%", label: "Percent of",glyph: "%", needsK: true,  apply: (a,k) => a * (k/100),      fText: (src, k) => `${k}% of ${src}`,          name: "Percent" },
  { op: "pow", label: "Power",   glyph: "xⁿ", needsK: true, apply: (a,k) => Math.pow(a, k),   fText: (src, k) => `${src}^${k}`,              name: "Power" },
  { op: "min", label: "Min",     glyph: "▼", needsK: true,  apply: (a,k) => Math.min(a, k),   fText: (src, k) => `MIN(${src}, ${k})`,        name: "Minimum" },
  { op: "max", label: "Max",     glyph: "▲", needsK: true,  apply: (a,k) => Math.max(a, k),   fText: (src, k) => `MAX(${src}, ${k})`,        name: "Maximum" },
  { op: "round",label: "Round",  glyph: "≈", needsK: false, apply: (a)   => Math.round(a),    fText: (src)    => `ROUND(${src})`,            name: "Rounded" },
];

function UnifiedCanvas({
  scenario, values, overrides, onOverride,
  density, colorScheme, highlightPath, setHighlightPath, detailNodeId, setDetailNodeId,
}) {
  const base = useMemoU(() => simplifyGraph(scenario.nodes), [scenario]);
  const { positions: basePositions, width: baseW, height: baseH } = useMemoU(
    () => unifiedLayout(base.primaryNodes, base.edges, { density }),
    [base, density]
  );

  // User-added derivative nodes: { id, fromId, op, k, label, position, kind:'derived' }
  const [userNodes, setUserNodes] = useStateU([]);

  // Fold user nodes into the graph for rendering
  const { primaryNodes, edges, positions, width, height } = useMemoU(() => {
    const pNodes = [...base.primaryNodes];
    const pEdges = [...base.edges];
    const pPos = { ...basePositions };
    let maxRight = baseW;
    let maxBottom = baseH;
    userNodes.forEach(u => {
      pNodes.push({
        id: u.id, label: u.label, kind: "computed", cell: u.cell || "—",
        unit: u.unit || "", formula: u.formulaText, value: u.value, __derived: true,
      });
      pEdges.push({
        id: `${u.fromId}->${u.id}:user`,
        source: u.fromId, target: u.id,
        op: (u.op === "-") ? "-" : "+",
        modifiers: [{
          opSymbol: OP_CATALOG.find(o => o.op === u.op)?.glyph || "·",
          rawOp: u.op === "+" || u.op === "-" ? "*" : (u.op === "/" ? "/" : "*"),
          num: u.k,
          constLabel: u.opLabel,
        }],
      });
      pPos[u.id] = { x: u.x, y: u.y, w: u.w, h: u.h };
      maxRight = Math.max(maxRight, u.x + u.w + 40);
      maxBottom = Math.max(maxBottom, u.y + u.h + 40);
    });
    return { primaryNodes: pNodes, edges: pEdges, positions: pPos, width: maxRight, height: maxBottom };
  }, [base, basePositions, baseW, baseH, userNodes]);

  const [hovered, setHovered] = useStateU(null);
  const [dragging, setDragging] = useStateU(null);
  const [userPos, setUserPos] = useStateU({});
  const [hoveredEdge, setHoveredEdge] = useStateU(null);
  const [picker, setPicker] = useStateU(null); // { edgeId, mx, my, sourceId, targetId, dirAngle }
  const [kInput, setKInput] = useStateU(null);  // { op, x, y, sourceId, targetId, dirAngle }
  const svgRef = useRefU(null);

  useEffectU(() => { setUserPos({}); setUserNodes([]); setPicker(null); setKInput(null); }, [scenario.title]);

  const pos = (id) => userPos[id] || positions[id];

  const highlightSet = useMemoU(() => {
    if (!highlightPath) return null;
    const set = new Set([highlightPath]);
    const byTarget = {};
    edges.forEach(e => { byTarget[e.target] = byTarget[e.target] || []; byTarget[e.target].push(e.source); });
    const walk = (id) => (byTarget[id] || []).forEach(s => { if (!set.has(s)) { set.add(s); walk(s); } });
    walk(highlightPath);
    return set;
  }, [highlightPath, edges]);

  const onMouseDown = (e, id) => {
    const svg = svgRef.current;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const p = pos(id);
    setDragging({ id, dx: pt.x - p.x, dy: pt.y - p.y });
    setDetailNodeId(id);
    setHighlightPath(id);
    e.stopPropagation();
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    const svg = svgRef.current;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    setUserPos(prev => ({ ...prev, [dragging.id]: { ...pos(dragging.id), x: pt.x - dragging.dx, y: pt.y - dragging.dy } }));
  };
  const onMouseUp = () => setDragging(null);

  const accentFor = (n) => colorScheme === "mono" ? "var(--ink-700)" : kindColor(n.kind);
  const opColor = (op) => colorScheme === "mono" ? "var(--ink-500)" :
    (op === "+" ? "var(--sage)" : op === "-" ? "var(--mauve)" : op === "*" ? "var(--slate)" : "var(--sand)");

  // curved hand-drawn-ish path
  const pathFor = (s, t) => {
    const sx = s.x + s.w, sy = s.y + s.h / 2;
    const tx = t.x, ty = t.y + t.h / 2;
    const mx = (sx + tx) / 2;
    const wob = (Math.sin((sx + sy) * 0.013) * 4);
    const dx = tx - sx, dy = ty - sy;
    const angle = Math.atan2(dy, dx); // direction from source to target
    return {
      d: `M ${sx} ${sy} C ${mx} ${sy + wob}, ${mx} ${ty - wob}, ${tx} ${ty}`,
      sx, sy, tx, ty, mx, my: (sy + ty) / 2, angle,
    };
  };

  // Create a new derived node from an edge midpoint (or a node handle)
  const createDerivedFromNode = (sourceId, op, k, angle) => {
    const src = pos(sourceId);
    if (!src) return;
    const sourceVal = values[sourceId] ?? 0;
    const spec = OP_CATALOG.find(o => o.op === op);
    if (!spec) return;
    const kVal = spec.needsK ? (k == null ? 0 : k) : 0;
    const newVal = spec.needsK ? spec.apply(sourceVal, kVal) : spec.apply(sourceVal);
    const srcNode = primaryNodes.find(n => n.id === sourceId);
    const srcLabel = srcNode?.label || sourceId;
    const newLabel = spec.name === "Rounded" ? `${srcLabel} (rounded)`
      : spec.name === "Percent"  ? `${kVal}% of ${srcLabel}`
      : spec.name === "Sum"      ? `${srcLabel} + ${kVal}`
      : spec.name === "Difference" ? `${srcLabel} − ${kVal}`
      : spec.name === "Product"  ? `${srcLabel} × ${kVal}`
      : spec.name === "Quotient" ? `${srcLabel} ÷ ${kVal}`
      : spec.name === "Power"    ? `${srcLabel}^${kVal}`
      : spec.name === "Minimum"  ? `Min(${srcLabel}, ${kVal})`
      : spec.name === "Maximum"  ? `Max(${srcLabel}, ${kVal})`
      : `${srcLabel} ${spec.glyph}`;

    // Place new node "in the same direction" as the edge's flow
    const nw = 168, nh = 82;
    const dist = 260;
    const cx = src.x + src.w + Math.max(60, Math.cos(angle) * dist);
    const cy = src.y + src.h / 2 + Math.sin(angle) * dist;
    const id = `u_${Math.random().toString(36).slice(2, 8)}`;
    const existingCol = userNodes.filter(u => Math.abs(u.x - (cx - nw/2)) < 20).length;
    const offY = existingCol * (nh + 30);
    setUserNodes(arr => [...arr, {
      id, fromId: sourceId, op, k: kVal,
      label: newLabel, unit: srcNode?.unit || "",
      value: newVal,
      formulaText: spec.fText(srcLabel, kVal),
      cell: "—",
      opLabel: spec.label,
      x: cx - nw/2, y: cy - nh/2 + offY, w: nw, h: nh,
    }]);
    setPicker(null);
    setKInput(null);
    setHoveredEdge(null);
    setDetailNodeId(id);
  };

  const viewW = Math.max(width, 900);
  const viewH = Math.max(height, 520);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--ink-0)", overflow: "auto" }}>
      <svg
        ref={svgRef}
        width={viewW} height={viewH}
        style={{ minWidth: "100%", minHeight: "100%", cursor: dragging ? "grabbing" : "default", display: "block" }}
        onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onClick={() => { setHighlightPath(null); setDetailNodeId(null); }}
      >
        <defs>
          <pattern id="u-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.8" fill="#E4E4E7" />
          </pattern>
          <filter id="rough-u">
            <feTurbulence baseFrequency="0.018" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="1.2" />
          </filter>
          <marker id="u-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--ink-600)" />
          </marker>
          {["sage","mauve","slate","sand"].map(c => (
            <marker key={c} id={`u-arrow-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill={`var(--${c})`} />
            </marker>
          ))}
        </defs>
        <rect width={viewW} height={viewH} fill="url(#u-dots)" />

        {/* edges */}
        {edges.map(e => {
          const s = pos(e.source); const t = pos(e.target);
          if (!s || !t) return null;
          const { d, sx, sy, tx, ty, mx, my, angle } = pathFor(s, t);
          const col = colorScheme === "mono" ? "var(--ink-500)"
                    : (e.op === "-" ? "var(--mauve)" : "var(--sage)");
          const strokeWidth = e.modifiers.some(m => m.rawOp === "*") ? 1.75 : 1.35;
          const dash = e.op === "-" ? "5 3" : null;
          const dim = highlightSet && !(highlightSet.has(e.source) && highlightSet.has(e.target));
          const markerId = colorScheme === "mono" ? "u-arrow" : `u-arrow-${e.op === "-" ? "mauve" : "sage"}`;
          const isEdgeHovered = hoveredEdge === e.id;
          return (
            <g key={e.id} opacity={dim ? 0.18 : 1}>
              <path d={d} fill="none" stroke={col} strokeWidth={strokeWidth} strokeDasharray={dash} markerEnd={`url(#${markerId})`} filter="url(#rough-u)" />
              {/* Wide transparent hit-area so the edge is easy to hover */}
              <path
                d={d} fill="none" stroke="transparent" strokeWidth="18"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredEdge(e.id)}
                onMouseLeave={() => !picker && setHoveredEdge(null)}
              />
              {/* operator chip on edge — hide when hovered (replaced by + puck) */}
              {!isEdgeHovered && (
                <EdgeLabel mx={mx} my={my} primaryOp={e.op} modifiers={e.modifiers} values={values} colorScheme={colorScheme} />
              )}
              {/* endpoint control dots (visible on hover) */}
              {isEdgeHovered && (
                <>
                  <circle cx={sx} cy={sy} r="3.5" fill="var(--ink-0)" stroke="var(--ink-700)" strokeWidth="1.2" />
                  <circle cx={tx} cy={ty} r="3.5" fill="var(--ink-0)" stroke="var(--ink-700)" strokeWidth="1.2" />
                </>
              )}
              {/* midpoint: + puck */}
              <g
                transform={`translate(${mx} ${my})`}
                style={{ cursor: "pointer", transition: "transform 180ms cubic-bezier(.2,.8,.2,1)" }}
                onMouseEnter={() => setHoveredEdge(e.id)}
                onMouseLeave={() => !picker && setHoveredEdge(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setPicker({ edgeId: e.id, mx, my, sourceId: e.target, angle });
                  setHoveredEdge(e.id);
                }}
              >
                {/* base control dot */}
                <circle r={isEdgeHovered ? 12 : 3}
                  fill={isEdgeHovered ? "var(--ink-1000)" : "var(--ink-0)"}
                  stroke={isEdgeHovered ? "var(--ink-1000)" : "var(--ink-700)"}
                  strokeWidth="1.2"
                  style={{ transition: "r 180ms cubic-bezier(.2,.8,.2,1), fill 160ms, stroke 160ms" }}
                />
                {isEdgeHovered && (
                  <>
                    <line x1="-5" y1="0" x2="5" y2="0" stroke="var(--ink-0)" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="0" y1="-5" x2="0" y2="5" stroke="var(--ink-0)" strokeWidth="1.6" strokeLinecap="round" />
                  </>
                )}
              </g>
            </g>
          );
        })}

        {/* nodes */}
        {primaryNodes.map(n => {
          const p = pos(n.id);
          if (!p) return null;
          const v = values[n.id];
          const accent = accentFor(n);
          const isDetail = detailNodeId === n.id;
          const isHover = hovered === n.id;
          const faded = highlightSet && !highlightSet.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              opacity={faded ? 0.28 : 1}
              onMouseDown={(e) => onMouseDown(e, n.id)}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "grab" }}
            >
              <rect
                x="0" y="0" width={p.w} height={p.h} rx="6" ry="6"
                fill={isDetail ? "var(--ink-50)" : "var(--ink-0)"}
                stroke={isDetail ? "var(--ink-900)" : isHover ? "var(--ink-400)" : "var(--ink-700)"}
                strokeWidth={isDetail ? 1.6 : 1.1}
                filter="url(#rough-u)"
              />
              <rect x="0" y="0" width="22" height="3" fill={accent} filter="url(#rough-u)" />
              <text x="12" y="19" fontSize="9" fontFamily="var(--sans)" fill="var(--ink-400)" letterSpacing="1.4" fontWeight="600">
                {kindLabel(n.kind)}
              </text>
              <text x={p.w - 12} y="19" textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--ink-400)">
                {n.cell}
              </text>
              <text x="12" y="38" fontSize="12" fontFamily="var(--sans)" fill="var(--ink-800)" fontWeight="600">
                {truncateU(n.label, 22)}
              </text>
              <text x="12" y={p.h - 16} fontSize="18" fontFamily="var(--mono)" fill="var(--ink-1000)" fontWeight="700">
                {fmt(v)}
              </text>
              {n.unit && (
                <text x={p.w - 12} y={p.h - 10} textAnchor="end" fontSize="10" fontFamily="var(--mono)" fill="var(--ink-400)">
                  {n.unit}
                </text>
              )}
              {/* 4 connection handles — visible on hover/detail */}
              {(isHover || isDetail) && (() => {
                const handles = [
                  { hx: p.w / 2, hy: 0,       angle: -Math.PI / 2, side: "n" },
                  { hx: p.w,     hy: p.h / 2, angle:  0,           side: "e" },
                  { hx: p.w / 2, hy: p.h,     angle:  Math.PI / 2, side: "s" },
                  { hx: 0,       hy: p.h / 2, angle:  Math.PI,     side: "w" },
                ];
                return handles.map(h => (
                  <g
                    key={h.side}
                    transform={`translate(${h.hx} ${h.hy})`}
                    style={{ cursor: "copy" }}
                    onMouseDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      // open picker at this handle — "source" is THIS node, direction along handle
                      const gx = p.x + h.hx;
                      const gy = p.y + h.hy;
                      setPicker({ edgeId: null, mx: gx, my: gy, sourceId: n.id, angle: h.angle });
                    }}
                  >
                    <circle r="6" fill="var(--ink-0)" stroke="var(--ink-900)" strokeWidth="1.2" />
                    <circle r="2.5" fill="var(--ink-900)" />
                  </g>
                ));
              })()}
            </g>
          );
        })}

        {/* ── Radial operator picker ── */}
        {picker && !kInput && (
          <RadialPicker
            cx={picker.mx} cy={picker.my} angle={picker.angle}
            onCancel={() => { setPicker(null); setHoveredEdge(null); }}
            onPick={(op) => {
              const spec = OP_CATALOG.find(o => o.op === op);
              if (!spec.needsK) {
                createDerivedFromNode(picker.sourceId, op, null, picker.angle);
              } else {
                // open k-input near the puck, offset outward
                const r = 84;
                const ox = picker.mx + Math.cos(picker.angle) * r;
                const oy = picker.my + Math.sin(picker.angle) * r;
                setKInput({ op, x: ox, y: oy, sourceId: picker.sourceId, angle: picker.angle });
              }
            }}
          />
        )}

        {/* ── Constant input bubble ── */}
        {kInput && (
          <ConstantInput
            x={kInput.x} y={kInput.y} op={kInput.op}
            onCancel={() => { setKInput(null); setPicker(null); setHoveredEdge(null); }}
            onCommit={(k) => createDerivedFromNode(kInput.sourceId, kInput.op, k, kInput.angle)}
          />
        )}
      </svg>

      <div style={{
        position: "absolute", left: 16, top: 16, display: "flex", gap: 8, alignItems: "center",
        padding: "6px 10px", background: "var(--ink-0)", border: "1px solid var(--ink-200)", borderRadius: 6,
      }}>
        <span style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Canvas</span>
        <span style={{ width: 1, height: 12, background: "var(--ink-200)" }} />
        <span style={{ fontSize: 10, color: "var(--ink-400)", fontFamily: "var(--mono)" }}>
          {primaryNodes.length} cards · {edges.length} connectors
        </span>
      </div>

      <div style={{ position: "absolute", right: 16, top: 16, display: "flex", gap: 6 }}>
        <ToolButton icon="+" label="Card" />
        <ToolButton icon="→" label="Connect" />
        <ToolButton icon="fx" label="Modifier" />
      </div>

      {highlightSet && (
        <button
          onClick={(e) => { e.stopPropagation(); setHighlightPath(null); setDetailNodeId(null); }}
          style={{
            position: "absolute", left: 16, bottom: 16,
            height: 26, padding: "0 10px", background: "var(--ink-0)",
            border: "1px solid var(--ink-300)", borderRadius: 4,
            fontSize: 11, fontWeight: 500, color: "var(--ink-700)", cursor: "pointer",
          }}
        >
          Clear focus
        </button>
      )}
    </div>
  );
}

function EdgeLabel({ mx, my, primaryOp, modifiers, values, colorScheme }) {
  // Construct chip text: e.g. "+ × 0.42" or "− × (1 − 0.23)"
  const parts = [];
  // only show primary op if it's - (since + is the default)
  if (primaryOp === "-") parts.push({ sym: "−", kind: "primary" });
  // else we still want a visible "+" marker on the chip for clarity
  else parts.push({ sym: "+", kind: "primary" });

  modifiers.forEach(mod => {
    if (mod.wrap) {
      // "(1 − rate)" style — compose text
      const rateVal = values[mod.constId];
      parts.push({
        sym: `${mod.opSymbol} (1 ${mod.wrap.includes("−") ? "−" : "+"} ${fmt(rateVal)})`,
        kind: "mod",
        label: mod.constLabel,
      });
    } else if (mod.constId) {
      const rateVal = values[mod.constId];
      parts.push({
        sym: `${mod.opSymbol} ${fmt(rateVal)}`,
        kind: "mod",
        label: mod.constLabel,
      });
    } else if (mod.num != null) {
      parts.push({ sym: `${mod.opSymbol} ${fmt(mod.num)}`, kind: "mod" });
    }
  });

  // compact: if only primary "+", collapse to just "+"
  const text = parts.map(p => p.sym).join(" ");
  const subText = modifiers.map(mod => mod.constLabel).filter(Boolean).join(" · ");

  const w = Math.max(32, text.length * 7 + 14);
  const h = subText ? 30 : 20;

  return (
    <g transform={`translate(${mx} ${my})`} style={{ pointerEvents: "none" }}>
      <rect
        x={-w/2} y={-h/2}
        width={w} height={h}
        rx="4"
        fill="var(--ink-1000)"
        opacity="0.94"
      />
      <text x="0" y={subText ? -2 : 4} textAnchor="middle" fontSize="11" fontFamily="var(--mono)" fill="var(--ink-0)" fontWeight="600">
        {text}
      </text>
      {subText && (
        <text x="0" y="10" textAnchor="middle" fontSize="8" fontFamily="var(--sans)" fill="var(--ink-400)" letterSpacing="0.04em">
          {truncateU(subText, 26)}
        </text>
      )}
    </g>
  );
}

function ToolButton({ icon, label }) {
  return (
    <button
      onClick={(e) => e.stopPropagation()}
      style={{
        height: 28, padding: "0 10px", background: "var(--ink-0)",
        border: "1px solid var(--ink-300)", borderRadius: 4,
        fontSize: 11, fontWeight: 500, color: "var(--ink-700)",
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
      }}
    >
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-900)" }}>{icon}</span>
      {label}
    </button>
  );
}

function svgPoint(svg, cx, cy) {
  const pt = svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function truncateU(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// ─── Radial operator picker (half-circle fan in the edge's flow direction) ───
function RadialPicker({ cx, cy, angle, onPick, onCancel }) {
  const [mounted, setMounted] = useStateU(false);
  useEffectU(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); };
  }, []);

  // Half-circle fanning forward along `angle`. Spread arcs from angle - 90° to angle + 90°.
  const n = OP_CATALOG.length; // 9
  const radius = 78;
  const span = Math.PI; // 180°
  const start = angle - span / 2;

  return (
    <g style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
      {/* dim backdrop; clicking it cancels */}
      <rect
        x="-5000" y="-5000" width="10000" height="10000"
        fill="rgba(24,24,27,0.18)"
        onClick={onCancel}
        style={{ opacity: mounted ? 1 : 0, transition: "opacity 160ms" }}
      />
      {/* anchor puck */}
      <g transform={`translate(${cx} ${cy})`}>
        <circle r="14" fill="var(--ink-1000)" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="var(--ink-0)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="0" y1="-6" x2="0" y2="6" stroke="var(--ink-0)" strokeWidth="1.8" strokeLinecap="round"
          transform={`rotate(${mounted ? 45 : 0})`}
          style={{ transition: "transform 220ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </g>
      {OP_CATALOG.map((spec, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const a = start + t * span;
        const tx = cx + Math.cos(a) * radius;
        const ty = cy + Math.sin(a) * radius;
        const delay = 20 + i * 28;
        return (
          <g
            key={spec.op}
            transform={`translate(${mounted ? tx : cx} ${mounted ? ty : cy})`}
            style={{
              transition: `transform 280ms cubic-bezier(.2,.9,.25,1.2) ${delay}ms, opacity 180ms ${delay}ms`,
              opacity: mounted ? 1 : 0,
              cursor: "pointer",
            }}
            onClick={(e) => { e.stopPropagation(); onPick(spec.op); }}
          >
            <circle r="18" fill="var(--ink-0)" stroke="var(--ink-900)" strokeWidth="1.3"
              style={{ filter: "drop-shadow(0 2px 4px rgba(24,24,27,0.18))" }}
            />
            <text textAnchor="middle" dominantBaseline="central"
              fontFamily="var(--mono)" fontSize={spec.glyph.length > 1 ? 12 : 16}
              fontWeight="700" fill="var(--ink-900)">
              {spec.glyph}
            </text>
            <title>{spec.label}</title>
          </g>
        );
      })}
    </g>
  );
}

// ─── Constant-input bubble (SVG + foreignObject) ───
function ConstantInput({ x, y, op, onCommit, onCancel }) {
  const spec = OP_CATALOG.find(o => o.op === op);
  const [val, setVal] = useStateU("");
  const inputRef = useRefU(null);
  useEffectU(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(id);
  }, []);

  const submit = () => {
    const n = parseFloat(val);
    if (!isNaN(n)) onCommit(n);
  };

  const W = 200, H = 60;
  return (
    <g style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}>
      <rect
        x="-5000" y="-5000" width="10000" height="10000"
        fill="rgba(24,24,27,0.18)"
        onClick={onCancel}
      />
      <foreignObject x={x - W/2} y={y - H/2} width={W} height={H}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{
          width: W, height: H, background: "var(--ink-0)",
          border: "1px solid var(--ink-900)", borderRadius: 6,
          boxShadow: "0 6px 18px rgba(24,24,27,0.14)",
          padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              {spec.label}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-900)", fontWeight: 700 }}>
              {spec.glyph}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              ref={inputRef}
              type="number" step="any"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
              placeholder="value"
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none",
                background: "var(--ink-50)", borderRadius: 3, padding: "4px 8px",
                fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-900)",
              }}
            />
            <button
              onClick={submit}
              style={{
                height: 24, padding: "0 10px", background: "var(--ink-900)", color: "var(--ink-0)",
                border: "none", borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              ↵
            </button>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

window.UnifiedCanvas = UnifiedCanvas;
window.simplifyGraph = simplifyGraph;
