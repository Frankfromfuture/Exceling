import type { FlowNode, FlowEdge, ParsedCell, Operator, OperatorNodeData } from '../../types'
import { tokenize } from './tokenize'
import type { Token } from './tokenize'

// ── Expression tree types ───────────────────────────────────────────────────

type ExprNode =
  | { kind: 'cell'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'binop'; op: Operator; left: ExprNode; right: ExprNode; fromSum?: boolean }
  | { kind: 'unknown' }

// ── Formula helpers ─────────────────────────────────────────────────────────

function colLetterToIdx(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function colIdxToLetter(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    n--
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26)
  }
  return s
}

function normalizeAddress(address: string) {
  return address.replace(/\$/g, '').toUpperCase()
}

function expandRangeRefs(rangeRef: string, availableAddresses: Set<string>): string[] {
  const [startRaw, endRaw] = rangeRef.split(':').map(normalizeAddress)
  const start = startRaw.match(/^([A-Z]+)(\d+)$/)
  const end = endRaw.match(/^([A-Z]+)(\d+)$/)
  if (!start || !end) return []

  const startCol = colLetterToIdx(start[1])
  const endCol = colLetterToIdx(end[1])
  const startRow = parseInt(start[2], 10)
  const endRow = parseInt(end[2], 10)

  const refs: string[] = []
  for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) {
    for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col++) {
      const address = `${colIdxToLetter(col)}${row}`
      if (availableAddresses.has(address)) refs.push(address)
    }
  }
  return refs
}

function splitFunctionArgs(content: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''

  for (const ch of content) {
    if (ch === '(') depth++
    if (ch === ')') depth--

    if ((ch === ',' || ch === ';') && depth === 0) {
      if (current.trim()) args.push(current.trim())
      current = ''
      continue
    }

    current += ch
  }

  if (current.trim()) args.push(current.trim())
  return args
}

function buildSumExprFromRefs(refs: string[]): ExprNode {
  if (refs.length === 0) return { kind: 'number', value: 0 }
  if (refs.length === 1) return { kind: 'cell', value: refs[0] }

  const [first, second, ...rest] = refs
  let expr: ExprNode = {
    kind: 'binop',
    op: '+',
    left: { kind: 'cell', value: first },
    right: { kind: 'cell', value: second },
    fromSum: true,
  }

  for (const ref of rest) {
    expr = {
      kind: 'binop',
      op: '+',
      left: expr,
      right: { kind: 'cell', value: ref },
      fromSum: true,
    }
  }

  return expr
}

function parseSumFormulaToExpr(formula: string, availableAddresses: Set<string>): ExprNode | null {
  const src = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim()
  const match = src.match(/^SUM\((.*)\)$/i)
  if (!match) return null

  const refs = splitFunctionArgs(match[1]).flatMap(arg => {
    const normalized = normalizeAddress(arg)
    if (/^(?:\[[^\]]+\])?(?:'[^']+'|[^'!]+)!/.test(arg)) return []
    if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(normalized)) return expandRangeRefs(normalized, availableAddresses)
    if (/^[A-Z]+\d+$/.test(normalized)) return [normalized]
    return []
  })

  return buildSumExprFromRefs(refs)
}

function expandSumArguments(content: string, availableAddresses: Set<string>): string {
  const pieces = splitFunctionArgs(content).flatMap(arg => {
    const normalized = normalizeAddress(arg)

    if (/^(?:\[[^\]]+\])?(?:'[^']+'|[^'!]+)!/.test(arg)) return [arg]
    if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(normalized)) return expandRangeRefs(normalized, availableAddresses)
    if (/^[A-Z]+\d+$/.test(normalized)) return [normalized]
    return [arg]
  })

  if (pieces.length === 0) return '0'
  return `(${pieces.join('+')})`
}

function expandSumFormula(formula: string, availableAddresses: Set<string>): string {
  let result = formula

  while (true) {
    const upper = result.toUpperCase()
    const sumIndex = upper.indexOf('SUM(')
    if (sumIndex === -1) break

    let depth = 0
    let endIndex = -1
    for (let i = sumIndex + 3; i < result.length; i++) {
      const ch = result[i]
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) {
          endIndex = i
          break
        }
      }
    }

    if (endIndex === -1) break

    const argsContent = result.slice(sumIndex + 4, endIndex)
    const expanded = expandSumArguments(argsContent, availableAddresses)
    result = `${result.slice(0, sumIndex)}${expanded}${result.slice(endIndex + 1)}`
  }

  return result
}

// ── Recursive-descent parser with precedence ────────────────────────────────

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter(t => t.type !== 'UNKNOWN' && t.type !== 'EXTERNAL_REF')
  }

  private peek(): Token | null { return this.tokens[this.pos] ?? null }
  private consume(): Token { return this.tokens[this.pos++] }

  parse(): ExprNode {
    return this.parseExpr()
  }

  private parseExpr(): ExprNode {
    let left = this.parseTerm()
    while (this.peek()?.type === 'OPERATOR' && '+-'.includes(this.peek()!.value)) {
      const op = this.consume().value as Operator
      const right = this.parseTerm()
      left = { kind: 'binop', op, left, right }
    }
    return left
  }

  private parseTerm(): ExprNode {
    let left = this.parseUnary()
    while (this.peek()?.type === 'OPERATOR' && '*/'.includes(this.peek()!.value)) {
      const op = this.consume().value as Operator
      const right = this.parseUnary()
      left = { kind: 'binop', op, left, right }
    }
    return left
  }

  private parseUnary(): ExprNode {
    if (this.peek()?.type === 'OPERATOR' && this.peek()?.value === '-') {
      this.consume()
      const f = this.parseFactor()
      if (f.kind === 'number') return { kind: 'number', value: -f.value }
      return { kind: 'binop', op: '*', left: { kind: 'number', value: -1 }, right: f }
    }
    return this.parseFactor()
  }

  private parseFactor(): ExprNode {
    const t = this.peek()
    if (!t) return { kind: 'unknown' }
    if (t.type === 'CELL_REF') { this.consume(); return { kind: 'cell', value: t.value } }
    if (t.type === 'NUMBER') { this.consume(); return { kind: 'number', value: parseFloat(t.value) } }
    if (t.type === 'LPAREN') {
      this.consume()
      const e = this.parseExpr()
      if (this.peek()?.type === 'RPAREN') this.consume()
      return e
    }
    this.consume()
    return { kind: 'unknown' }
  }
}

// ── Graph builder ───────────────────────────────────────────────────────────

let _idCounter = 0
function uid(prefix: string) { return `${prefix}_${_idCounter++}` }

interface LiteralOperand {
  side: 'left' | 'right'
  value: number | string
  isPercent: boolean
}

interface WalkResult {
  extraNodes: FlowNode[]
  extraEdges: FlowEdge[]
  outputId: string | null
  operator: Operator
  literalOperand: Omit<LiteralOperand, 'side'> | null
}

const DEFAULT_OP: Operator = '+'

function attachOperand(
  operatorData: OperatorNodeData,
  operatorId: string,
  side: 'left' | 'right',
  result: WalkResult,
): FlowEdge[] {
  if (result.outputId) {
    return [{
      id: uid('e'),
      source: result.outputId,
      target: operatorId,
      type: 'animatedEdge',
      data: { operator: operatorData.operator },
    }]
  }

  if (result.literalOperand) {
    operatorData.literalOperands.push({
      side,
      value: result.literalOperand.value,
      isPercent: result.literalOperand.isPercent,
    })
  }

  return []
}

function collectSumTerms(node: ExprNode): string[] {
  if (node.kind === 'cell') return [node.value]
  if (node.kind === 'number') return [String(node.value)]
  if (node.kind === 'binop' && node.fromSum && node.op === '+') {
    return [...collectSumTerms(node.left), ...collectSumTerms(node.right)]
  }
  return []
}

function walkTree(
  node: ExprNode,
  resultCellId: string,
  currentOp: Operator,
): WalkResult {
  if (node.kind === 'cell') {
    return { extraNodes: [], extraEdges: [], outputId: node.value, operator: currentOp, literalOperand: null }
  }

  if (node.kind === 'number') {
    return {
      extraNodes: [],
      extraEdges: [],
      outputId: null,
      operator: currentOp,
      literalOperand: { value: node.value, isPercent: false },
    }
  }

  if (node.kind === 'binop') {
    const left = walkTree(node.left, resultCellId, node.op)
    const right = walkTree(node.right, resultCellId, node.op)
    const opId = uid('op')
    const operatorData: OperatorNodeData = {
      operator: node.op,
      literalOperands: [],
      sumTerms: node.fromSum && node.op === '+' ? collectSumTerms(node) : undefined,
    }

    const opNode: FlowNode = {
      id: opId,
      type: 'operatorNode',
      position: { x: 0, y: 0 },
      data: operatorData,
    }

    const ownEdges = node.fromSum && node.op === '+'
      ? [
          ...left.extraEdges,
          ...right.extraEdges,
          ...(left.outputId ? [{
            id: uid('e'),
            source: left.outputId,
            target: opId,
            type: 'animatedEdge' as const,
            data: { operator: operatorData.operator },
          }] : []),
          ...(right.outputId ? [{
            id: uid('e'),
            source: right.outputId,
            target: opId,
            type: 'animatedEdge' as const,
            data: { operator: operatorData.operator },
          }] : []),
        ]
      : [
          ...attachOperand(operatorData, opId, 'left', left),
          ...attachOperand(operatorData, opId, 'right', right),
        ]

    return {
      extraNodes: [...left.extraNodes, ...right.extraNodes, opNode],
      extraEdges: node.fromSum && node.op === '+'
        ? ownEdges
        : [...left.extraEdges, ...right.extraEdges, ...ownEdges],
      outputId: opId,
      operator: node.op,
      literalOperand: null,
    }
  }

  return { extraNodes: [], extraEdges: [], outputId: resultCellId, operator: currentOp, literalOperand: null }
}

// ── Complex formula detection ────────────────────────────────────────────────

/**
 * Functions that the arithmetic tokenizer cannot parse.
 * Cells using these will be rendered with direct dep→cell edges (no operator nodes).
 */
const COMPLEX_FN_RE = /\b(IF|IFS|VLOOKUP|HLOOKUP|INDEX|MATCH|CHOOSE|SWITCH|INDIRECT|OFFSET|SUMIF|SUMIFS|COUNTIF|COUNTIFS|AVERAGEIF|AVERAGEIFS|MAX|MIN|LARGE|SMALL|AND|OR|NOT|IFERROR|ISERROR|ISBLANK|ISNUMBER|ISTEXT|COUNTA|COUNT|AVERAGE|ROUND|ROUNDUP|ROUNDDOWN|INT|ABS|MOD|LEFT|RIGHT|MID|LEN|TRIM|SUBSTITUTE|REPLACE|CONCATENATE|CONCAT|TEXTJOIN|TEXT|FIND|SEARCH|DATE|TODAY|NOW|YEAR|MONTH|DAY|EDATE|EOMONTH|NETWORKDAYS|WORKDAY|RANK|PERCENTILE|STDEV|VAR|CORREL|PMT|PV|FV|RATE|NPV|IRR)\b/i

function isComplexFormula(formula: string): boolean {
  return COMPLEX_FN_RE.test(formula)
}

// ── Public API ──────────────────────────────────────────────────────────────

export function buildFlowGraph(cells: ParsedCell[]): {
  nodes: FlowNode[]
  edges: FlowEdge[]
} {
  _idCounter = 0

  const computeCells = cells.filter(
    c => !(typeof c.value === 'string' && c.formula == null && !c.isMarked)
  )
  const availableAddresses = new Set(computeCells.map(cell => normalizeAddress(cell.address)))

  const externalFormulaAddresses = new Set<string>()
  const cellsWithFormula = computeCells.filter(c => c.formula)

  for (const cell of cellsWithFormula) {
    const expandedFormula = expandSumFormula(cell.formula!, availableAddresses)
    const tokens = tokenize(expandedFormula)
    if (tokens.some(t => t.type === 'EXTERNAL_REF')) {
      externalFormulaAddresses.add(cell.address)
    }
  }

  const graphFormulaCells = cellsWithFormula.filter(c => !externalFormulaAddresses.has(c.address))

  const cellNodes: FlowNode[] = computeCells.map(c => ({
    id: c.address,
    type: 'cellNode' as const,
    position: { x: 0, y: 0 },
    data: {
      address: c.address,
      value: c.value,
      formula: c.formula,
      label: c.label ?? c.comment,
      isInput: !c.formula || externalFormulaAddresses.has(c.address),
      isOutput: false,
      isMarked: c.isMarked,
      isPercent: c.isPercent,
    },
  }))

  const allExtraNodes: FlowNode[] = []
  const allEdges: FlowEdge[] = []

  for (const cell of graphFormulaCells) {
    const sumExpr = parseSumFormulaToExpr(cell.formula!, availableAddresses)
    const expandedFormula = sumExpr ? null : expandSumFormula(cell.formula!, availableAddresses)
    const tokens = expandedFormula ? tokenize(expandedFormula) : []
    const tree = sumExpr ?? new Parser(tokens).parse()
    const result = walkTree(tree, cell.address, DEFAULT_OP)

    allExtraNodes.push(...result.extraNodes)
    allEdges.push(...result.extraEdges)

    if (result.outputId && result.outputId !== cell.address) {
      allEdges.push({
        id: uid('e'),
        source: result.outputId,
        target: cell.address,
        type: 'animatedEdge',
        data: { operator: result.operator },
      })
    }
  }

  // ── Complex formula cells (IF / VLOOKUP / MAX / etc.) ────────────────────
  // These can't be parsed into operator trees. Use the deps array (from Go backend)
  // to create direct cell→cell edges. Mark the node as isComplex for the narration.
  const complexFormulaCells = cellsWithFormula.filter(
    c => isComplexFormula(c.formula!) && c.deps?.length
  )
  const complexCellIds = new Set(complexFormulaCells.map(c => c.address))

  for (const cell of complexFormulaCells) {
    for (const dep of cell.deps!) {
      if (availableAddresses.has(dep) && dep !== cell.address) {
        allEdges.push({
          id: uid('e'),
          source: dep,
          target: cell.address,
          type: 'animatedEdge',
          data: { operator: '+' },
        })
      }
    }
  }

  const hasIncoming = new Set(allEdges.map(e => e.target))
  const hasOutgoing = new Set(allEdges.map(e => e.source))
  const formulaCellIds = new Set(graphFormulaCells.map(c => c.address))
  const markedCells = computeCells.filter(c => c.isMarked)

  let markedStartAddress: string | undefined
  let markedEndAddress: string | undefined

  if (markedCells.length === 2) {
    const [c1, c2] = markedCells
    const c1Score = (formulaCellIds.has(c1.address) ? 2 : 0) + (hasIncoming.has(c1.address) ? 1 : 0)
    const c2Score = (formulaCellIds.has(c2.address) ? 2 : 0) + (hasIncoming.has(c2.address) ? 1 : 0)
    
    if (c1Score < c2Score) {
      markedStartAddress = c1.address
      markedEndAddress = c2.address
    } else if (c2Score < c1Score) {
      markedStartAddress = c2.address
      markedEndAddress = c1.address
    } else {
      markedStartAddress = c1.address
      markedEndAddress = c2.address
    }
  } else {
    markedStartAddress = markedCells.find(c => !formulaCellIds.has(c.address) && !hasIncoming.has(c.address))?.address
      ?? markedCells.find(c => !formulaCellIds.has(c.address))?.address
      ?? markedCells[0]?.address

    markedEndAddress = [...markedCells].reverse().find(c => formulaCellIds.has(c.address) && !hasOutgoing.has(c.address))?.address
      ?? [...markedCells].reverse().find(c => formulaCellIds.has(c.address))?.address
      ?? markedCells[markedCells.length - 1]?.address
  }

  const updatedCellNodes = cellNodes.map(n => {
    if (n.type !== 'cellNode') return n
    const cell = computeCells.find(c => c.address === n.id)
    const isMarkedStart = n.id === markedStartAddress
    const isMarkedEnd = n.id === markedEndAddress && markedEndAddress !== markedStartAddress

    let isInput = !cell?.formula || externalFormulaAddresses.has(n.id)
    let isOutput = (formulaCellIds.has(n.id) || complexCellIds.has(n.id)) && !hasOutgoing.has(n.id)
    const isComplex = complexCellIds.has(n.id)

    if (markedCells.length > 0) {
      if (isMarkedStart) {
        isInput = true
        isOutput = false
      }
      if (isMarkedEnd) {
        isOutput = true
        isInput = false
      }
      if (cell?.isMarked && !isMarkedStart && !isMarkedEnd) {
        isInput = !cell.formula || externalFormulaAddresses.has(n.id)
      }
    }

    return { ...n, data: { ...n.data, isInput, isOutput, isComplex } }
  })

  return {
    nodes: [...updatedCellNodes, ...allExtraNodes],
    edges: allEdges,
  }
}
