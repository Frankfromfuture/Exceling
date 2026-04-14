import { useEffect } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
import type { FlowNode } from '../../types'

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

function buildExpressionInfo(
  nodeId: string,
  nodes: FlowNode[],
  edges: { source: string; target: string }[],
  displaySettings: { numberDecimals: number; percentMode: boolean; percentDecimals: number },
): { text: string; isRateLike: boolean } {
  const node = nodes.find(item => item.id === nodeId)
  if (!node) return { text: '未知项', isRateLike: false }

  if (node.type === 'cellNode') {
    const label = getNodeLabel(node)
    const value = formatNarrationValue(
      node.data.value,
      node.data.isPercent,
      displaySettings.numberDecimals,
      displaySettings.percentMode,
      displaySettings.percentDecimals,
    )

    if (node.data.isInput) return { text: `${label}${value}`, isRateLike: node.data.isPercent && displaySettings.percentMode }

    const incoming = edges.filter(edge => edge.target === node.id)
    if (incoming.length === 0) return { text: `${label}${value}`, isRateLike: node.data.isPercent && displaySettings.percentMode }
    return buildExpressionInfo(incoming[0].source, nodes, edges, displaySettings)
  }

  if (node.type === 'operatorNode') {
    if (node.data.operator === '+' && node.data.sumTerms?.length) {
      const sumTexts = node.data.sumTerms.map(term => {
        const termNode = nodes.find(item => item.id === term)
        if (termNode?.type === 'cellNode') {
          const label = getNodeLabel(termNode)
          const value = formatNarrationValue(
            termNode.data.value,
            termNode.data.isPercent,
            displaySettings.numberDecimals,
            displaySettings.percentMode,
            displaySettings.percentDecimals,
          )
          return `${label}${value}`
        }
        return term
      })

      return { text: `${sumTexts.join('、')}之和`, isRateLike: false }
    }

    const incoming = edges.filter(edge => edge.target === node.id)
    const leftEdge = incoming[0]
    const rightEdge = incoming[1]
    const leftLiteral = node.data.literalOperands.find(item => item.side === 'left')
    const rightLiteral = node.data.literalOperands.find(item => item.side === 'right')

    const leftInfo = leftEdge
      ? buildExpressionInfo(leftEdge.source, nodes, edges, displaySettings)
      : leftLiteral
        ? {
            text: formatNarrationValue(
              leftLiteral.value,
              leftLiteral.isPercent,
              displaySettings.numberDecimals,
              displaySettings.percentMode,
              displaySettings.percentDecimals,
            ),
            isRateLike: leftLiteral.isPercent,
          }
        : { text: '左侧数值', isRateLike: false }

    const rightInfo = rightEdge
      ? buildExpressionInfo(rightEdge.source, nodes, edges, displaySettings)
      : rightLiteral
        ? {
            text: formatNarrationValue(
              rightLiteral.value,
              rightLiteral.isPercent,
              displaySettings.numberDecimals,
              displaySettings.percentMode,
              displaySettings.percentDecimals,
            ),
            isRateLike: rightLiteral.isPercent,
          }
        : { text: '右侧数值', isRateLike: false }

    if (node.data.operator === '+') {
      return { text: `${leftInfo.text}加上${rightInfo.text}`, isRateLike: false }
    }
    if (node.data.operator === '-') {
      return { text: `${leftInfo.text}减去${rightInfo.text}`, isRateLike: false }
    }
    if (node.data.operator === '*') {
      if (rightInfo.isRateLike) {
        return { text: `${leftInfo.text}按${rightInfo.text}计算`, isRateLike: false }
      }
      return { text: `${leftInfo.text}乘以${rightInfo.text}`, isRateLike: false }
    }
    if (node.data.operator === '/') {
      if (rightInfo.isRateLike) {
        return { text: `${leftInfo.text}按${rightInfo.text}折算`, isRateLike: false }
      }
      return { text: `${leftInfo.text}除以${rightInfo.text}`, isRateLike: false }
    }

    return { text: `${leftInfo.text}结合${rightInfo.text}`, isRateLike: false }
  }

  return { text: '未知项', isRateLike: false }
}

/** Extract leading function name from a formula string, e.g. "=IF(..." → "IF" */
function getFormulaFuncName(formula: string | null): string | null {
  if (!formula) return null
  const m = formula.match(/^=\s*([A-Z]+)\s*\(/i)
  return m ? m[1].toUpperCase() : null
}

function buildNarrationLine(
  node: FlowNode,
  nodes: FlowNode[],
  edges: { source: string; target: string }[],
  displaySettings: { numberDecimals: number; percentMode: boolean; percentDecimals: number },
) {
  if (node.type !== 'cellNode') return null

  const label = getNodeLabel(node)
  const value = formatNarrationValue(
    node.data.value,
    node.data.isPercent,
    displaySettings.numberDecimals,
    displaySettings.percentMode,
    displaySettings.percentDecimals,
  )

  if (node.data.isInput) return `${label}为${value}。`

  const incoming = edges.filter(edge => edge.target === node.id)
  if (incoming.length === 0) return `${label}为${value}。`

  // Complex formula (IF / VLOOKUP / MAX / etc.) — show function name + dep list
  if (node.data.isComplex) {
    const funcName = getFormulaFuncName(node.data.formula as string | null)
    const depLabels = incoming
      .map(e => {
        const src = nodes.find(n => n.id === e.source)
        return src ? getNodeLabel(src) : e.source
      })
      .join('、')
    const prefix = funcName ? `经 ${funcName} 函数` : '经公式'
    return `${prefix}（依据 ${depLabels}），${label}为${value}。`
  }

  const expression = buildExpressionInfo(incoming[0].source, nodes, edges, displaySettings)
  return `${expression.text}后，${label}为${value}。`
}

function PlaybackNarration() {
  const { animationStatus, animationStep, animationSteps, nodes, edges, displaySettings, mainPathNodeIds } = useFlowStore()

  const visibleStepCount = animationStatus === 'done'
    ? animationSteps.length
    : animationStatus === 'idle'
      ? 0
      : animationStep

  const narrationLines = animationSteps
    .slice(0, visibleStepCount)
    .flatMap(step => step.nodeIds)
    .map(id => nodes.find(node => node.id === id))
    .filter((node): node is FlowNode => Boolean(node))
    .filter(node => mainPathNodeIds.size === 0 || mainPathNodeIds.has(node.id))
    .map(node => buildNarrationLine(node, nodes, edges, displaySettings))
    .filter((line): line is string => Boolean(line))

  let title = '计算解说'
  if (animationStatus === 'playing') title = `计算进行中 · 已播放 ${visibleStepCount} 步`
  else if (animationStatus === 'paused') title = `计算已暂停 · 已播放 ${visibleStepCount} 步`
  else if (animationStatus === 'done') title = '计算完成'

  const narrationText = narrationLines.join('')

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[min(820px,calc(100%-11rem))] rounded-2xl border border-lpf-border bg-lpf-surface/92 backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.08)] px-5 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" />
        <p className="text-[11px] uppercase tracking-[0.22em] text-lpf-subtle font-semibold">{title}</p>
      </div>

      {narrationText ? (
        <p className="text-[14px] leading-7 text-lpf-text whitespace-normal break-words">
          {narrationText}
        </p>
      ) : (
        <p className="text-[14px] leading-6 text-lpf-text">
          点击下方播放后，这里会按计算顺序累积显示自然语言描述，不会删除前面的过程说明。
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
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: false }}
        nodesDraggable
        panOnScroll
        zoomOnScroll
        snapToGrid
        snapGrid={[28, 28]}
      >
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
