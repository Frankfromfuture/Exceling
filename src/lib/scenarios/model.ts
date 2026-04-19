// Built-in scenario data model + compute engine
// Ported 1:1 from the Exceling canvas design prototype

export type NodeKind = 'input' | 'const' | 'computed' | 'output'

export interface ScenarioNode {
  id: string
  kind: NodeKind
  label: string
  cell: string
  value?: number
  unit?: string
  formula?: string
}

export interface ScenarioEdge {
  id: string
  source: string
  target: string
  op: string
}

export interface SketchLayout {
  [id: string]: { x: number; y: number; w: number; h: number; style?: string }
}

export interface Scenario {
  title: string
  subtitle: string
  nodes: ScenarioNode[]
  sketchLayout: SketchLayout
}

// ---------- Sample scenarios ----------
export const SCENARIOS: Record<string, Scenario> = {
  revenue: {
    title: '收入利润模型',
    subtitle: 'Revenue → Net Profit',
    nodes: [
      { id: 'units',     kind: 'input',    label: 'Units Sold',       cell: 'B2',  value: 2400,  unit: '台' },
      { id: 'price',     kind: 'input',    label: 'Unit Price',       cell: 'B3',  value: 128,   unit: '¥' },
      { id: 'revenue',   kind: 'computed', label: 'Revenue',          cell: 'B5',  formula: 'units * price' },
      { id: 'cogs_rate', kind: 'const',    label: 'COGS Rate',        cell: 'B6',  value: 0.42,  unit: '%' },
      { id: 'cogs',      kind: 'computed', label: 'COGS',             cell: 'B7',  formula: 'revenue * cogs_rate' },
      { id: 'gross',     kind: 'computed', label: 'Gross Profit',     cell: 'B8',  formula: 'revenue - cogs' },
      { id: 'opex',      kind: 'input',    label: 'OpEx',             cell: 'B9',  value: 62000, unit: '¥' },
      { id: 'operating', kind: 'computed', label: 'Operating Profit', cell: 'B10', formula: 'gross - opex' },
      { id: 'tax_rate',  kind: 'const',    label: 'Tax Rate',         cell: 'B11', value: 0.23,  unit: '%' },
      { id: 'net',       kind: 'output',   label: 'Net Profit',       cell: 'B13', formula: 'operating * (1 - tax_rate)' },
    ],
    sketchLayout: {
      units:     { x: 90,  y: 120, w: 140, h: 70 },
      price:     { x: 90,  y: 240, w: 140, h: 70 },
      revenue:   { x: 320, y: 180, w: 160, h: 72 },
      cogs_rate: { x: 320, y: 330, w: 140, h: 70 },
      cogs:      { x: 530, y: 310, w: 140, h: 70 },
      gross:     { x: 530, y: 180, w: 160, h: 72 },
      opex:      { x: 530, y: 60,  w: 140, h: 70 },
      operating: { x: 730, y: 180, w: 170, h: 72 },
      tax_rate:  { x: 730, y: 330, w: 140, h: 70 },
      net:       { x: 960, y: 230, w: 180, h: 84 },
    },
  },
  saas: {
    title: 'SaaS MRR 漏斗',
    subtitle: 'Leads → MRR',
    nodes: [
      { id: 'leads',      kind: 'input',    label: 'Monthly Leads', cell: 'B2', value: 4800, unit: '人' },
      { id: 'mql_rate',   kind: 'const',    label: 'MQL Rate',      cell: 'B3', value: 0.35 },
      { id: 'mql',        kind: 'computed', label: 'MQLs',          cell: 'B5', formula: 'leads * mql_rate' },
      { id: 'sql_rate',   kind: 'const',    label: 'SQL Rate',      cell: 'B6', value: 0.42 },
      { id: 'sql',        kind: 'computed', label: 'SQLs',          cell: 'B7', formula: 'mql * sql_rate' },
      { id: 'close_rate', kind: 'const',    label: 'Close Rate',    cell: 'B8', value: 0.18 },
      { id: 'deals',      kind: 'computed', label: 'New Deals',     cell: 'B9', formula: 'sql * close_rate' },
      { id: 'acv',        kind: 'input',    label: 'Avg ACV',       cell: 'B10', value: 960, unit: '¥/mo' },
      { id: 'mrr',        kind: 'output',   label: 'New MRR',       cell: 'B12', formula: 'deals * acv' },
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
    title: '工程估算',
    subtitle: 'Material + Labor → Total Cost',
    nodes: [
      { id: 'qty',       kind: 'input',    label: 'Quantity',      cell: 'B2', value: 1200, unit: 'm³' },
      { id: 'mat_price', kind: 'input',    label: 'Material ¥/m³', cell: 'B3', value: 580 },
      { id: 'material',  kind: 'computed', label: 'Material Cost', cell: 'B5', formula: 'qty * mat_price' },
      { id: 'hours',     kind: 'input',    label: 'Labor Hours',   cell: 'B6', value: 420, unit: 'h' },
      { id: 'rate',      kind: 'input',    label: 'Hourly Rate',   cell: 'B7', value: 120, unit: '¥/h' },
      { id: 'labor',     kind: 'computed', label: 'Labor Cost',    cell: 'B9', formula: 'hours * rate' },
      { id: 'overhead',  kind: 'const',    label: 'Overhead Mult', cell: 'B10', value: 1.18 },
      { id: 'total',     kind: 'output',   label: 'Total Cost',    cell: 'B12', formula: '(material + labor) * overhead' },
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
}

// ---------- Compute engine ----------
function evalFormula(expr: string, scope: Record<string, number>): number {
  try {
    const names = Object.keys(scope)
    const vals = names.map((n) => scope[n])
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...names, `return (${expr});`) as (...args: number[]) => unknown
    const result = fn(...vals)
    return typeof result === 'number' && Number.isFinite(result) ? result : 0
  } catch {
    return 0
  }
}

export function extractDeps(formula: string): string[] {
  const matches = formula.match(/[a-z_][a-z0-9_]*/gi) ?? []
  return [...new Set(matches)]
}

export function computeAll(
  nodes: ScenarioNode[],
  overrides: Record<string, number> = {},
): Record<string, number> {
  const result: Record<string, number> = {}
  const resolved = new Set<string>()

  nodes.forEach((n) => {
    if (n.kind === 'input' || n.kind === 'const') {
      result[n.id] = overrides[n.id] ?? n.value ?? 0
      resolved.add(n.id)
    }
  })

  let safety = 50
  while (resolved.size < nodes.length && safety-- > 0) {
    nodes.forEach((n) => {
      if (resolved.has(n.id)) return
      if (!n.formula) return
      const deps = extractDeps(n.formula)
      if (deps.every((d) => resolved.has(d))) {
        result[n.id] = evalFormula(n.formula, result)
        resolved.add(n.id)
      }
    })
  }

  return result
}

export function formulaToExcel(formula: string, nodes: ScenarioNode[]): string {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  return formula.replace(/[a-z_][a-z0-9_]*/gi, (m) => byId[m]?.cell ?? m)
}

function detectEdgeOp(formula: string, depId: string): string {
  const idx = formula.indexOf(depId)
  if (idx === -1) return '+'
  const before = formula.slice(0, idx)
  const after = formula.slice(idx + depId.length)
  const opBefore = before.match(/([+\-*/])\s*\(?\s*$/)
  const opAfter = after.match(/^\s*\)?\s*([+\-*/])/)
  if (opBefore) return opBefore[1]
  if (opAfter) return opAfter[1]
  return '+'
}

export function deriveScenarioEdges(
  nodes: ScenarioNode[],
): Array<{ id: string; source: string; target: string; op: string }> {
  const edges: Array<{ id: string; source: string; target: string; op: string }> = []
  nodes.forEach((n) => {
    if (!n.formula) return
    const deps = extractDeps(n.formula)
    deps.forEach((d) => {
      const srcNode = nodes.find((x) => x.id === d)
      if (!srcNode) return
      const op = detectEdgeOp(n.formula!, d)
      edges.push({ id: `${d}->${n.id}`, source: d, target: n.id, op })
    })
  })
  return edges
}

// ---------- Formatting ----------
export function fmt(n: number | null | undefined, opts: { percent?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (opts.percent) return (n * 100).toFixed(1) + '%'
  if (Math.abs(n) < 1 && n !== 0) return n.toFixed(3)
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString()
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString()
  return n.toFixed(2).replace(/\.?0+$/, '')
}

export function kindColor(kind: NodeKind): string {
  const map: Record<NodeKind, string> = {
    input: 'var(--accent-sage)',
    const: 'var(--accent-sand)',
    computed: 'var(--accent-slate)',
    output: 'var(--accent-mauve)',
  }
  return map[kind] ?? 'var(--ink-400)'
}

export function kindLabel(kind: NodeKind): string {
  const map: Record<NodeKind, string> = {
    input: 'INPUT',
    const: 'CONST',
    computed: 'COMPUTED',
    output: 'OUTPUT',
  }
  return map[kind] ?? kind.toUpperCase()
}

// ---------- Layout (unified DAG, matches design's unifiedLayout) ----------
export function scenarioLayout(
  nodes: ScenarioNode[],
  opts: { density?: 'compact' | 'comfortable' | 'spacious' } = {},
): Record<string, { x: number; y: number; w: number; h: number }> {
  let nodeW = 168, nodeH = 82, gapX = 96, gapY = 40
  if (opts.density === 'compact')  { nodeW = 148; nodeH = 74; gapX = 64;  gapY = 24 }
  if (opts.density === 'spacious') { nodeW = 200; nodeH = 96; gapX = 128; gapY = 56 }

  const incoming: Record<string, string[]> = {}
  const outgoing: Record<string, string[]> = {}
  nodes.forEach((n) => { incoming[n.id] = []; outgoing[n.id] = [] })

  const edges = deriveScenarioEdges(nodes)
  edges.forEach((e) => {
    if (incoming[e.target]) incoming[e.target].push(e.source)
    if (outgoing[e.source]) outgoing[e.source].push(e.target)
  })

  const level: Record<string, number> = {}
  const visit = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    if (level[id] != null) return level[id]
    const ins = incoming[id] ?? []
    level[id] = ins.length === 0 ? 0 : 1 + Math.max(...ins.map((i) => visit(i, seen)))
    return level[id]
  }
  nodes.forEach((n) => visit(n.id))

  const levels: Record<number, string[]> = {}
  nodes.forEach((n) => {
    levels[level[n.id]] = levels[level[n.id]] ?? []
    levels[level[n.id]].push(n.id)
  })

  const keys = Object.keys(levels).map(Number).sort((a, b) => a - b)
  const colH: Record<number, number> = {}
  keys.forEach((l) => { colH[l] = levels[l].length * (nodeH + gapY) - gapY })
  const maxH = Math.max(...Object.values(colH))

  const stableHash = (s: string) =>
    s.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)

  const positions: Record<string, { x: number; y: number; w: number; h: number }> = {}
  keys.forEach((l) => {
    const col = levels[l]
    const yOff = 40 + (maxH - colH[l]) / 2
    col.forEach((id, i) => {
      const jx = (stableHash(id) % 9) - 4
      const jy = (stableHash(id + 'y') % 9) - 4
      positions[id] = {
        x: 40 + l * (nodeW + gapX) + jx,
        y: yOff + i * (nodeH + gapY) + jy,
        w: nodeW,
        h: nodeH,
      }
    })
  })

  return positions
}
