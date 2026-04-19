// Shared data model: nodes, edges, compute engine, sample scenarios

const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ---------- Sample scenarios ----------
// Each scenario has: nodes (input/const/computed/output) with formulas, and a sketch layout
const SCENARIOS = {
  revenue: {
    title: "收入利润模型",
    subtitle: "Revenue → Net Profit",
    nodes: [
      { id: "units",      kind: "input",    label: "Units Sold",    cell: "B2",  value: 2400,   unit: "台" },
      { id: "price",      kind: "input",    label: "Unit Price",    cell: "B3",  value: 128,    unit: "¥" },
      { id: "revenue",    kind: "computed", label: "Revenue",       cell: "B5",  formula: "units * price" },
      { id: "cogs_rate",  kind: "const",    label: "COGS Rate",     cell: "B6",  value: 0.42,   unit: "%" },
      { id: "cogs",       kind: "computed", label: "COGS",          cell: "B7",  formula: "revenue * cogs_rate" },
      { id: "gross",      kind: "computed", label: "Gross Profit",  cell: "B8",  formula: "revenue - cogs" },
      { id: "opex",       kind: "input",    label: "OpEx",          cell: "B9",  value: 62000,  unit: "¥" },
      { id: "operating",  kind: "computed", label: "Operating Profit", cell: "B10", formula: "gross - opex" },
      { id: "tax_rate",   kind: "const",    label: "Tax Rate",      cell: "B11", value: 0.23,   unit: "%" },
      { id: "net",        kind: "output",   label: "Net Profit",    cell: "B13", formula: "operating * (1 - tax_rate)" },
    ],
    // Rough sketch positions (messy / hand-drawn feel). Units are abstract 0-1000 canvas coords.
    sketchLayout: {
      units:     { x: 90,  y: 120, w: 140, h: 70, style: "rect" },
      price:     { x: 90,  y: 240, w: 140, h: 70, style: "rect" },
      revenue:   { x: 320, y: 180, w: 160, h: 72, style: "rect" },
      cogs_rate: { x: 320, y: 330, w: 140, h: 70, style: "rect" },
      cogs:      { x: 530, y: 310, w: 140, h: 70, style: "rect" },
      gross:     { x: 530, y: 180, w: 160, h: 72, style: "rect" },
      opex:      { x: 530, y: 60,  w: 140, h: 70, style: "rect" },
      operating: { x: 730, y: 180, w: 170, h: 72, style: "rect" },
      tax_rate:  { x: 730, y: 330, w: 140, h: 70, style: "rect" },
      net:       { x: 960, y: 230, w: 180, h: 84, style: "rect" },
    },
  },
  saas: {
    title: "SaaS MRR 漏斗",
    subtitle: "Leads → MRR",
    nodes: [
      { id: "leads",      kind: "input",    label: "Monthly Leads", cell: "B2", value: 4800, unit: "人" },
      { id: "mql_rate",   kind: "const",    label: "MQL Rate",      cell: "B3", value: 0.35 },
      { id: "mql",        kind: "computed", label: "MQLs",          cell: "B5", formula: "leads * mql_rate" },
      { id: "sql_rate",   kind: "const",    label: "SQL Rate",      cell: "B6", value: 0.42 },
      { id: "sql",        kind: "computed", label: "SQLs",          cell: "B7", formula: "mql * sql_rate" },
      { id: "close_rate", kind: "const",    label: "Close Rate",    cell: "B8", value: 0.18 },
      { id: "deals",      kind: "computed", label: "New Deals",     cell: "B9", formula: "sql * close_rate" },
      { id: "acv",        kind: "input",    label: "Avg ACV",       cell: "B10", value: 960, unit: "¥/mo" },
      { id: "mrr",        kind: "output",   label: "New MRR",       cell: "B12", formula: "deals * acv" },
    ],
    sketchLayout: {
      leads:      { x: 80,  y: 180, w: 150, h: 70 },
      mql_rate:   { x: 80,  y: 320, w: 140, h: 70 },
      mql:        { x: 290, y: 250, w: 140, h: 70 },
      sql_rate:   { x: 290, y: 390, w: 140, h: 70 },
      sql:        { x: 500, y: 320, w: 140, h: 70 },
      close_rate: { x: 500, y: 60,  w: 140, h: 70 },
      deals:      { x: 710, y: 190, w: 150, h: 70 },
      acv:        { x: 710, y: 330, w: 140, h: 70 },
      mrr:        { x: 930, y: 260, w: 170, h: 84 },
    },
  },
  engineering: {
    title: "工程估算",
    subtitle: "Material + Labor → Total Cost",
    nodes: [
      { id: "qty",        kind: "input",    label: "Quantity",     cell: "B2", value: 1200, unit: "m³" },
      { id: "mat_price",  kind: "input",    label: "Material ¥/m³", cell: "B3", value: 580 },
      { id: "material",   kind: "computed", label: "Material Cost", cell: "B5", formula: "qty * mat_price" },
      { id: "hours",      kind: "input",    label: "Labor Hours",   cell: "B6", value: 420, unit: "h" },
      { id: "rate",       kind: "input",    label: "Hourly Rate",   cell: "B7", value: 120, unit: "¥/h" },
      { id: "labor",      kind: "computed", label: "Labor Cost",    cell: "B9", formula: "hours * rate" },
      { id: "overhead",   kind: "const",    label: "Overhead Mult", cell: "B10", value: 1.18 },
      { id: "total",      kind: "output",   label: "Total Cost",    cell: "B12", formula: "(material + labor) * overhead" },
    ],
    sketchLayout: {
      qty:       { x: 80,  y: 120, w: 140, h: 70 },
      mat_price: { x: 80,  y: 240, w: 160, h: 70 },
      material:  { x: 330, y: 180, w: 160, h: 72 },
      hours:     { x: 80,  y: 360, w: 140, h: 70 },
      rate:      { x: 80,  y: 470, w: 140, h: 70 },
      labor:     { x: 330, y: 420, w: 150, h: 72 },
      overhead:  { x: 570, y: 170, w: 150, h: 70 },
      total:     { x: 820, y: 290, w: 180, h: 84 },
    },
  },
};

// ---------- Formula compute ----------
function evalFormula(expr, scope) {
  // Replace identifiers with scope values, then Function-eval.
  // Safe-enough for our closed scope since we control all expressions.
  try {
    const names = Object.keys(scope);
    const vals = names.map(n => scope[n]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `return (${expr});`);
    const result = fn(...vals);
    return Number.isFinite(result) ? result : 0;
  } catch (e) {
    return 0;
  }
}

function computeAll(nodes, overrides = {}) {
  const result = {};
  const resolved = new Set();
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  // topological-ish: inputs/consts first, then loop until stable
  nodes.forEach(n => {
    if (n.kind === "input" || n.kind === "const") {
      result[n.id] = overrides[n.id] ?? n.value;
      resolved.add(n.id);
    }
  });
  let safety = 50;
  while (resolved.size < nodes.length && safety--) {
    nodes.forEach(n => {
      if (resolved.has(n.id)) return;
      if (n.formula) {
        // check deps — parse identifiers
        const deps = extractDeps(n.formula);
        if (deps.every(d => resolved.has(d))) {
          result[n.id] = evalFormula(n.formula, result);
          resolved.add(n.id);
        }
      }
    });
  }
  return result;
}

function extractDeps(formula) {
  const matches = formula.match(/[a-z_][a-z0-9_]*/gi) || [];
  return [...new Set(matches)];
}

function formulaToExcel(formula, nodes) {
  // Replace identifiers with cell references
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  return formula.replace(/[a-z_][a-z0-9_]*/gi, (m) => byId[m]?.cell ?? m);
}

// Derive edges from formulas
function deriveEdges(nodes) {
  const edges = [];
  nodes.forEach(n => {
    if (!n.formula) return;
    const deps = extractDeps(n.formula);
    deps.forEach(d => {
      const srcNode = nodes.find(x => x.id === d);
      if (!srcNode) return;
      const op = detectEdgeOp(n.formula, d);
      edges.push({
        id: `${d}->${n.id}`,
        source: d,
        target: n.id,
        op,
      });
    });
  });
  return edges;
}

function detectEdgeOp(formula, depId) {
  // Rough: look at the operator immediately adjacent to depId in formula
  const idx = formula.indexOf(depId);
  if (idx === -1) return "+";
  const before = formula.slice(0, idx);
  const after = formula.slice(idx + depId.length);
  // find the nearest operator in either direction, skipping spaces and parens
  const opBefore = before.match(/([+\-*/])\s*\(?\s*$/);
  const opAfter = after.match(/^\s*\)?\s*([+\-*/])/);
  // Prefer the operator that "joins" this term to another
  if (opBefore) return opBefore[1];
  if (opAfter) return opAfter[1];
  return "+";
}

// Format number for display
function fmt(n, opts = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (opts.percent) return (n * 100).toFixed(1) + "%";
  if (Math.abs(n) < 1 && n !== 0) return n.toFixed(3);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString();
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function kindColor(kind) {
  return ({
    input: "var(--sage)",
    const: "var(--sand)",
    computed: "var(--slate)",
    output: "var(--mauve)",
  })[kind] || "var(--ink-400)";
}

function kindLabel(kind) {
  return ({
    input: "INPUT",
    const: "CONST",
    computed: "COMPUTED",
    output: "OUTPUT",
  })[kind] || kind;
}

// Narration — generate natural language
function buildNarration(nodes, values) {
  const output = nodes.find(n => n.kind === "output");
  if (!output) return "";
  const chain = [];
  function walk(id) {
    const n = nodes.find(x => x.id === id);
    if (!n) return;
    if (n.formula) {
      const deps = extractDeps(n.formula);
      deps.forEach(walk);
      chain.push(n);
    }
  }
  walk(output.id);
  const seen = new Set();
  const steps = chain.filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  return steps.map(n => {
    const v = values[n.id];
    return `${n.label} = ${fmt(v)}`;
  });
}

window.SCENARIOS = SCENARIOS;
window.computeAll = computeAll;
window.extractDeps = extractDeps;
window.formulaToExcel = formulaToExcel;
window.deriveEdges = deriveEdges;
window.fmt = fmt;
window.kindColor = kindColor;
window.kindLabel = kindLabel;
window.buildNarration = buildNarration;
