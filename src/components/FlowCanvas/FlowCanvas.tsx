import { useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronUp, ChevronDown } from 'lucide-react'

import { CellNode }     from '../nodes/CellNode'
import { OperatorNode } from '../nodes/OperatorNode'
import { AnimatedEdge } from '../edges/AnimatedEdge'
import { AnimationBar } from '../AnimationBar/AnimationBar'
import { useFlowStore } from '../../store/flowStore'
import type { FlowNode, FlowEdge } from '../../types'

const nodeTypes: NodeTypes = {
  cellNode:     CellNode as any,
  operatorNode: OperatorNode as any,
}
const edgeTypes: EdgeTypes = {
  animatedEdge: AnimatedEdge as any,
}

const LEGEND = [
  { op: '+', color: '#22c55e', label: '加法' },
  { op: '-', color: '#ef4444', label: '减法' },
  { op: '*', color: '#3b82f6', label: '乘法' },
  { op: '/', color: '#f97316', label: '除法' },
]

function StepBtn({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center w-5 h-5 rounded border border-lpf-border bg-lpf-surface hover:border-lpf-border-light hover:bg-lpf-card disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}

function DisplayPanel() {
  const { displaySettings, setDisplaySettings } = useFlowStore()
  const { numberDecimals, percentMode, percentDecimals } = displaySettings

  const clamp = (v: number) => Math.max(0, Math.min(3, v))

  return (
    <div className="mt-2 pt-2 border-t border-lpf-border">
      <p className="text-[9px] text-lpf-subtle uppercase tracking-widest mb-2 font-medium">显示精度</p>

      {/* Number decimals */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] text-lpf-muted">数值</span>
        <div className="flex items-center gap-1">
          <StepBtn onClick={() => setDisplaySettings({ numberDecimals: clamp(numberDecimals - 1) })} disabled={numberDecimals <= 0}>
            <ChevronDown className="w-3 h-3 text-lpf-muted" />
          </StepBtn>
          <span className="text-[12px] font-mono text-lpf-text w-3 text-center">{numberDecimals}</span>
          <StepBtn onClick={() => setDisplaySettings({ numberDecimals: clamp(numberDecimals + 1) })} disabled={numberDecimals >= 3}>
            <ChevronUp className="w-3 h-3 text-lpf-muted" />
          </StepBtn>
        </div>
      </div>

      {/* Percent mode toggle + decimals */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] text-lpf-muted">参数</span>
        <button
          onClick={() => setDisplaySettings({ percentMode: !percentMode })}
          className={[
            'text-[10px] font-mono px-2 py-0.5 rounded border transition-colors',
            percentMode
              ? 'border-sky-700/60 bg-sky-900/30 text-sky-400'
              : 'border-lpf-border bg-transparent text-lpf-subtle hover:border-lpf-border-light',
          ].join(' ')}
          title={percentMode ? '当前：百分比显示' : '当前：小数显示'}
        >
          {percentMode ? '%' : '0.x'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-lpf-subtle pl-2">位数</span>
        <div className="flex items-center gap-1">
          <StepBtn onClick={() => setDisplaySettings({ percentDecimals: clamp(percentDecimals - 1) })} disabled={percentDecimals <= 0}>
            <ChevronDown className="w-3 h-3 text-lpf-muted" />
          </StepBtn>
          <span className="text-[12px] font-mono text-lpf-text w-3 text-center">{percentDecimals}</span>
          <StepBtn onClick={() => setDisplaySettings({ percentDecimals: clamp(percentDecimals + 1) })} disabled={percentDecimals >= 3}>
            <ChevronUp className="w-3 h-3 text-lpf-muted" />
          </StepBtn>
        </div>
      </div>
    </div>
  )
}

function formatNarrationValue(
  v: number | string | null,
  isPercent: boolean,
  numDec: number,
  pctMode: boolean,
  pctDec: number,
) {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (isPercent && pctMode) {
    return (v * 100).toLocaleString('zh-CN', {
      minimumFractionDigits: pctDec,
      maximumFractionDigits: pctDec,
    }) + '%'
  }

  const dec = isPercent ? pctDec : numDec
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function getNodeLabel(node: FlowNode | undefined) {
  if (!node) return '未知项'
  if (node.type === 'cellNode') {
    return typeof node.data.label === 'string' && node.data.label.trim()
      ? node.data.label.trim()
      : node.data.address
  }
  return '计算项'
}

/** Extract leading function name from a formula string, e.g. "=IF(..." → "IF" */
function getFormulaFuncName(formula: string | null): string | null {
  if (!formula) return null
  const m = formula.match(/^=\s*([A-Z]+)\s*\(/i)
  return m ? m[1].toUpperCase() : null
}

type DS = { numberDecimals: number; percentMode: boolean; percentDecimals: number }

function fmtV(node: FlowNode, ds: DS): string {
  if (node.type !== 'cellNode') return '—'
  return formatNarrationValue(
    node.data.value, node.data.isPercent,
    ds.numberDecimals, ds.percentMode, ds.percentDecimals,
  )
}

function isInputCell(node: FlowNode, edges: FlowEdge[]): boolean {
  if (node.type !== 'cellNode') return false
  return node.data.isInput || edges.filter(e => e.target === node.id).length === 0
}

/**
 * Build a natural-language phrase describing how a calc cell was derived.
 * Returns only the core description (no leading connector, no trailing 。).
 */
function buildCalcDesc(
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  ds: DS,
): string {
  if (node.type !== 'cellNode') return ''
  const label = getNodeLabel(node)
  const value = fmtV(node, ds)

  // Complex formula (IF / VLOOKUP / etc.)
  if (node.data.isComplex) {
    const funcName = getFormulaFuncName((node.data.formula as string | null) ?? null)
    const incoming = edges.filter(e => e.target === node.id)
    const deps = incoming
      .map(e => nodes.find(n => n.id === e.source))
      .filter((n): n is FlowNode => Boolean(n))
      .map(n => getNodeLabel(n))
      .join('、')
    const fn = funcName ? `${funcName}函数` : '公式'
    return deps
      ? `经${fn}对${deps}进行计算，${label}为${value}`
      : `${label}经${fn}得出为${value}`
  }

  const incoming = edges.filter(e => e.target === node.id)
  if (!incoming.length) return `${label}为${value}`

  const opNode = nodes.find(n => n.id === incoming[0].source)
  if (!opNode || opNode.type !== 'operatorNode') return `${label}为${value}`

  const op  = opNode.data.operator
  const opIncoming = edges.filter(e => e.target === opNode.id)
  const leftLit  = opNode.data.literalOperands.find(l => l.side === 'left')
  const rightLit = opNode.data.literalOperands.find(l => l.side === 'right')

  // SUM of many named terms
  if (op === '+' && opNode.data.sumTerms && opNode.data.sumTerms.length >= 2) {
    const terms = opNode.data.sumTerms
      .map(tid => nodes.find(n => n.id === tid))
      .filter((n): n is FlowNode => Boolean(n))
    const termStr = terms.map(n => getNodeLabel(n)).join('、')
    return `将${termStr}加总，${label}合计为${value}`
  }

  // Binary operator — resolve left / right sources
  const leftSrcId  = opIncoming[0]?.source
  const rightSrcId = opIncoming[1]?.source
  const leftNode   = leftSrcId  ? nodes.find(n => n.id === leftSrcId)  : null
  const rightNode  = rightSrcId ? nodes.find(n => n.id === rightSrcId) : null

  const leftText = leftNode?.type === 'cellNode'
    ? getNodeLabel(leftNode)
    : leftLit
      ? formatNarrationValue(leftLit.value, leftLit.isPercent, ds.numberDecimals, ds.percentMode, ds.percentDecimals)
      : null

  const rightText = rightNode?.type === 'cellNode'
    ? getNodeLabel(rightNode)
    : rightLit
      ? formatNarrationValue(rightLit.value, rightLit.isPercent, ds.numberDecimals, ds.percentMode, ds.percentDecimals)
      : null

  const rightIsPercent = Boolean(
    (rightNode?.type === 'cellNode' ? rightNode.data.isPercent : rightLit?.isPercent) && ds.percentMode,
  )
  const leftIsPercent = Boolean(
    (leftNode?.type === 'cellNode' ? leftNode.data.isPercent : leftLit?.isPercent) && ds.percentMode,
  )

  if (!leftText && !rightText) return `${label}为${value}`

  switch (op) {
    case '+':
      if (leftText && rightText) return `将${leftText}与${rightText}相加，${label}合计为${value}`
      return `${leftText ?? rightText}计入后，${label}为${value}`
    case '-':
      if (leftText && rightText) return `以${leftText}扣除${rightText}，${label}为${value}`
      return `${label}为${value}`
    case '*':
      if (rightIsPercent && leftText && rightText) return `${leftText}按${rightText}计提，${label}为${value}`
      if (leftIsPercent && rightText && leftText)  return `${rightText}按${leftText}计提，${label}为${value}`
      if (leftText && rightText) return `${leftText}乘以${rightText}，${label}为${value}`
      return `${label}为${value}`
    case '/':
      if (rightIsPercent && leftText && rightText) return `${leftText}按${rightText}折算，${label}为${value}`
      if (leftText && rightText) return `${leftText}除以${rightText}，${label}为${value}`
      return `${label}为${value}`
    default:
      return `${label}为${value}`
  }
}

/**
 * Assemble activated cell nodes into one cohesive natural-language paragraph.
 * Mimics how a person would walk through a calculation chain in a verbal report.
 */
function buildNaturalParagraph(
  cells: FlowNode[],
  nodes: FlowNode[],
  edges: FlowEdge[],
  ds: DS,
): string {
  if (!cells.length) return ''

  const inputCells = cells.filter(n => isInputCell(n, edges))
  const calcCells  = cells.filter(n => !isInputCell(n, edges))

  const sentences: string[] = []

  // ── Opening: state the raw input values ───────────────────────────────────
  if (inputCells.length === 1) {
    const n = inputCells[0]
    sentences.push(`${getNodeLabel(n)}为${fmtV(n, ds)}`)
  } else if (inputCells.length > 1) {
    const items = inputCells.map(n => `${getNodeLabel(n)}为${fmtV(n, ds)}`)
    sentences.push(`其中，${items.join('，')}`)
  }

  // ── Calculation sentences with natural transitions ─────────────────────────
  const MID_CONNECTORS = ['在此基础上，', '进而，', '由此，', '此后，']
  calcCells.forEach((n, i) => {
    const isOutputNode = Boolean((n.data as { isOutput?: boolean }).isOutput)
    const desc = buildCalcDesc(n, nodes, edges, ds)

    if (isOutputNode) {
      sentences.push(`最终，${desc}`)
    } else if (i === 0 && inputCells.length > 0) {
      sentences.push(`在此基础上，${desc}`)
    } else {
      const connector = MID_CONNECTORS[Math.min(i, MID_CONNECTORS.length - 1)]
      sentences.push(`${connector}${desc}`)
    }
  })

  return sentences.map(s => s + '。').join('')
}

/**
 * Programmatically fits the viewport to main-path nodes whenever the graph
 * or main path changes. Must be rendered inside the ReactFlow provider.
 */
function FlowAutoFit() {
  const { fitView } = useReactFlow()
  const hasMainPath  = useFlowStore(s => s.hasMainPath)
  const mainPathNodeIds = useFlowStore(s => s.mainPathNodeIds)
  const storeNodes   = useFlowStore(s => s.nodes)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (storeNodes.length === 0) return

    // Cancel any pending fit so rapid updates don't stack
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      if (hasMainPath && mainPathNodeIds.size > 0) {
        // Fit to main-path nodes only — fills the screen with the highlighted subgraph
        fitView({
          padding: 0.10,
          nodes: [...mainPathNodeIds].map(id => ({ id })),
          maxZoom: 1.4,
          duration: 550,
        })
      } else {
        fitView({ padding: 0.12, maxZoom: 1.2, duration: 550 })
      }
    }, 80) // wait for React Flow to finish measuring node dimensions

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [storeNodes, hasMainPath, mainPathNodeIds, fitView])

  return null
}

function PlaybackNarration() {
  const {
    animationStatus, animationStep, animationSteps,
    nodes, edges, displaySettings,
    mainPathNodeIds, hasMainPath,
  } = useFlowStore()

  const visibleStepCount =
    animationStatus === 'done' ? animationSteps.length :
    animationStatus === 'idle' ? 0 : animationStep

  // Collect activated cell nodes in step order, main-path only
  const activatedCells = animationSteps
    .slice(0, visibleStepCount)
    .flatMap(step => step.nodeIds)
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is FlowNode => Boolean(n) && n.type === 'cellNode')
    .filter(n => !hasMainPath || mainPathNodeIds.has(n.id))

  const paragraph = buildNaturalParagraph(activatedCells, nodes, edges, displaySettings)

  let title = '计算解说'
  let dotColor = 'bg-slate-400'
  if (animationStatus === 'playing') { title = '计算进行中'; dotColor = 'bg-emerald-400 animate-pulse' }
  else if (animationStatus === 'paused') { title = '已暂停'; dotColor = 'bg-amber-400' }
  else if (animationStatus === 'done')   { title = '计算完成'; dotColor = 'bg-sky-400' }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[min(820px,calc(100%-11rem))] rounded-2xl border border-lpf-border bg-lpf-surface/92 backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.08)] px-5 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex h-2 w-2 rounded-full ${dotColor}`} />
        <p className="text-[11px] uppercase tracking-[0.22em] text-lpf-subtle font-semibold">{title}</p>
      </div>

      {paragraph ? (
        <p className="text-[14px] leading-[1.85] text-lpf-text whitespace-normal break-words">
          {paragraph}
        </p>
      ) : (
        <p className="text-[13px] leading-6 text-lpf-muted">
          点击播放后，这里会用自然语言逐步描述计算主路径的推导过程。
        </p>
      )}
    </div>
  )
}

export function FlowCanvas() {
  const storeNodes = useFlowStore(s => s.nodes)
  const storeEdges = useFlowStore(s => s.edges)

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes as any)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges as any)

  useEffect(() => { setNodes(storeNodes as any) }, [storeNodes, setNodes])
  useEffect(() => { setEdges(storeEdges as any) }, [storeEdges, setEdges])

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={3}
        proOptions={{ hideAttribution: false }}
        nodesDraggable
        panOnScroll
        zoomOnScroll
        snapToGrid
        snapGrid={[28, 28]}
      >
        <FlowAutoFit />
        <Background
          id="grid-lines"
          variant={BackgroundVariant.Lines}
          gap={28}
          size={1}
          color="#dddddd"
          style={{ background: '#efefef', opacity: 0.38 }}
        />
        <Background
          id="grid-dots"
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1.8}
          color="#c3c3c3"
          style={{ background: 'transparent' }}
        />
        <Controls position="bottom-right" style={{ bottom: '80px' }} />
        <MiniMap
          position="top-right"
          nodeColor={(node) => {
            if (node.type === 'operatorNode') return '#6b7280'
            if (node.type === 'constantNode') return '#b45309'
            return '#9ca3af'
          }}
          maskColor="rgba(0,0,0,0.12)"
          style={{ background: '#f5f5f5', border: '1px solid #d8d8d8', borderRadius: 10 }}
        />
      </ReactFlow>

      <PlaybackNarration />

      {/* Left panel: legend + display settings */}
      <div className="absolute top-24 left-4 z-10 bg-lpf-surface/90 backdrop-blur-sm border border-lpf-border rounded-xl px-3 py-2.5 min-w-[130px]">
        <p className="text-[9px] text-lpf-subtle uppercase tracking-widest mb-2 font-medium">运算类型</p>
        {LEGEND.map(({ op, color, label }) => (
          <div key={op} className="flex items-center gap-2 mb-1 last:mb-0">
            <div className="flex items-center gap-1">
              <div className="w-7 border-t border-dashed opacity-70" style={{ borderColor: color }} />
              <span className="w-4 h-4 rounded-sm flex items-center justify-center text-[10px] font-bold border"
                style={{ color, borderColor: `${color}60`, background: `${color}12` }}>
                {op === '*' ? '×' : op === '/' ? '÷' : op}
              </span>
            </div>
            <span className="text-[11px] text-lpf-muted">{label}</span>
          </div>
        ))}
        <DisplayPanel />
      </div>

      <AnimationBar />
    </div>
  )
}
