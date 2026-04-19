import type { ParsedCell, WhatIfScenario, WhatIfDelta } from '../../types'
import { tokenize, type Token } from '../formula/tokenize'

const MAX_SUM_EXPANSION_DEPTH = 5
const MAX_SUM_EXPANSION_TERMS = 200

type ExprNode =
  | { kind: 'cell'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'binop'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode }
  | { kind: 'unknown' }

type EvalResult =
  | { ok: true; value: number | string | null }
  | { ok: false }

function normalizeAddress(address: string): string {
  return address.replace(/\$/g, '').toUpperCase()
}

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

function expandSumArguments(content: string, availableAddresses: Set<string>): string {
  const pieces = splitFunctionArgs(content).flatMap(arg => {
    const normalized = normalizeAddress(arg)

    if (/^(?:\[[^\]]+\])?(?:'[^']+'|[^'!]+)!/.test(arg)) return [arg]
    if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(normalized)) return expandRangeRefs(normalized, availableAddresses)
    if (/^[A-Z]+\d+$/.test(normalized)) return [normalized]
    return [arg]
  })

  if (pieces.length === 0) return '0'
  return `(${pieces.slice(0, MAX_SUM_EXPANSION_TERMS).join('+')})`
}

function expandSumFormula(formula: string, availableAddresses: Set<string>): string {
  let result = formula
  let depthCount = 0

  while (true) {
    if (depthCount >= MAX_SUM_EXPANSION_DEPTH) break
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
    depthCount += 1
  }

  return result
}

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter(t => t.type !== 'UNKNOWN' && t.type !== 'EXTERNAL_REF')
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null
  }

  private consume(): Token {
    return this.tokens[this.pos++]
  }

  parse(): ExprNode {
    return this.parseExpr()
  }

  private parseExpr(): ExprNode {
    let left = this.parseTerm()
    while (this.peek()?.type === 'OPERATOR' && '+-'.includes(this.peek()!.value)) {
      const op = this.consume().value as '+' | '-'
      const right = this.parseTerm()
      left = { kind: 'binop', op, left, right }
    }
    return left
  }

  private parseTerm(): ExprNode {
    let left = this.parseUnary()
    while (this.peek()?.type === 'OPERATOR' && '*/'.includes(this.peek()!.value)) {
      const op = this.consume().value as '*' | '/'
      const right = this.parseUnary()
      left = { kind: 'binop', op, left, right }
    }
    return left
  }

  private parseUnary(): ExprNode {
    if (this.peek()?.type === 'OPERATOR' && this.peek()?.value === '-') {
      this.consume()
      const factor = this.parseFactor()
      if (factor.kind === 'number') return { kind: 'number', value: -factor.value }
      return { kind: 'binop', op: '*', left: { kind: 'number', value: -1 }, right: factor }
    }
    return this.parseFactor()
  }

  private parseFactor(): ExprNode {
    const token = this.peek()
    if (!token) return { kind: 'unknown' }

    if (token.type === 'CELL_REF') {
      this.consume()
      return { kind: 'cell', value: token.value }
    }

    if (token.type === 'NUMBER') {
      this.consume()
      const isPercent = token.value.endsWith('%')
      const value = parseFloat(token.value) / (isPercent ? 100 : 1)
      return { kind: 'number', value }
    }

    if (token.type === 'LPAREN') {
      this.consume()
      const expr = this.parseExpr()
      if (this.peek()?.type === 'RPAREN') this.consume()
      return expr
    }

    this.consume()
    return { kind: 'unknown' }
  }
}

function evaluateExpressionTree(
  node: ExprNode,
  evaluateCell: (address: string, stack: Set<string>) => EvalResult,
  stack: Set<string>,
): EvalResult {
  if (node.kind === 'number') return { ok: true, value: node.value }
  if (node.kind === 'cell') return evaluateCell(node.value, stack)
  if (node.kind !== 'binop') return { ok: false }

  const left = evaluateExpressionTree(node.left, evaluateCell, stack)
  const right = evaluateExpressionTree(node.right, evaluateCell, stack)
  if (!left.ok || !right.ok) return { ok: false }
  if (typeof left.value !== 'number' || typeof right.value !== 'number') return { ok: false }

  switch (node.op) {
    case '+': return { ok: true, value: left.value + right.value }
    case '-': return { ok: true, value: left.value - right.value }
    case '*': return { ok: true, value: left.value * right.value }
    case '/': return { ok: true, value: right.value === 0 ? null : left.value / right.value }
    default: return { ok: false }
  }
}

function splitTopLevelComparator(expr: string): { left: string; operator: string; right: string } | null {
  let depth = 0
  const comparators = ['>=', '<=', '<>', '>', '<', '=']

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth !== 0) continue

    for (const comparator of comparators) {
      if (expr.slice(i, i + comparator.length) === comparator) {
        return {
          left: expr.slice(0, i).trim(),
          operator: comparator,
          right: expr.slice(i + comparator.length).trim(),
        }
      }
    }
  }

  return null
}

function compareValues(left: number, operator: string, right: number): boolean {
  switch (operator) {
    case '>': return left > right
    case '<': return left < right
    case '>=': return left >= right
    case '<=': return left <= right
    case '=': return left === right
    case '<>': return left !== right
    default: return false
  }
}

export function simulateWhatIf(
  cells: ParsedCell[],
  overrides: Record<string, number>,
): WhatIfScenario {
  const normalizedOverrides = Object.fromEntries(
    Object.entries(overrides).map(([address, value]) => [normalizeAddress(address), value]),
  )
  const cellByAddress = new Map(cells.map(cell => [normalizeAddress(cell.address), cell]))
  const availableAddresses = new Set(cellByAddress.keys())
  const cache = new Map<string, number | string | null>()
  const unsupportedCells = new Set<string>()

  const evaluateFormula = (formula: string, stack: Set<string>): EvalResult => {
    const src = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim()
    const upper = src.toUpperCase()

    if (upper.startsWith('IF(') && src.endsWith(')')) {
      const args = splitFunctionArgs(src.slice(3, -1))
      if (args.length >= 3) {
        const condition = splitTopLevelComparator(args[0])
        if (!condition) return { ok: false }

        const left = evaluateFormula(condition.left, stack)
        const right = evaluateFormula(condition.right, stack)
        if (!left.ok || !right.ok || typeof left.value !== 'number' || typeof right.value !== 'number') {
          return { ok: false }
        }

        return evaluateFormula(compareValues(left.value, condition.operator, right.value) ? args[1] : args[2], stack)
      }
      return { ok: false }
    }

    const expandedFormula = expandSumFormula(src, availableAddresses)
    const tokens = tokenize(expandedFormula)
    if (tokens.some(token => token.type === 'UNKNOWN' || token.type === 'EXTERNAL_REF')) {
      return { ok: false }
    }
    const tree = new Parser(tokens).parse()
    return evaluateExpressionTree(tree, evaluateCell, stack)
  }

  const evaluateCell = (address: string, parentStack = new Set<string>()): EvalResult => {
    const normalized = normalizeAddress(address)

    if (Object.prototype.hasOwnProperty.call(normalizedOverrides, normalized)) {
      return { ok: true, value: normalizedOverrides[normalized] }
    }

    if (cache.has(normalized)) {
      return { ok: true, value: cache.get(normalized) ?? null }
    }

    const cell = cellByAddress.get(normalized)
    if (!cell) return { ok: false }

    if (parentStack.has(normalized)) {
      unsupportedCells.add(normalized)
      return { ok: true, value: cell.value }
    }

    if (!cell.formula) {
      cache.set(normalized, cell.value)
      return { ok: true, value: cell.value }
    }

    const nextStack = new Set(parentStack)
    nextStack.add(normalized)
    const result = evaluateFormula(cell.formula, nextStack)
    if (!result.ok) {
      unsupportedCells.add(normalized)
      cache.set(normalized, cell.value)
      return { ok: true, value: cell.value }
    }

    cache.set(normalized, result.value)
    return result
  }

  const recomputed: Record<string, number | string | null> = {}
  const delta: Record<string, WhatIfDelta> = {}

  for (const cell of cells) {
    const normalized = normalizeAddress(cell.address)
    const result = evaluateCell(normalized)
    const nextValue = result.ok ? result.value : cell.value
    recomputed[normalized] = nextValue

    if (typeof cell.value === 'number' && typeof nextValue === 'number') {
      const abs = nextValue - cell.value
      const pct = cell.value === 0 ? null : abs / cell.value
      if (abs !== 0) {
        delta[normalized] = { abs, pct }
      }
    }
  }

  return {
    overrides: normalizedOverrides,
    recomputed,
    delta,
    unsupportedCells: [...unsupportedCells].sort(),
  }
}
