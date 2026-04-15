import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CellFlowNode, CellNodeData } from '../../types'
import { useFlowStore } from '../../store/flowStore'

function formatValue(
  v: number | string | null,
  isPercent: boolean,
  numDec: number,
  pctMode: boolean,
  pctDec: number,
): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number') {
    if (isPercent && pctMode) {
      // Multiply by 100 and show as %
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
  return String(v)
}

export const CellNode = memo(function CellNode({ id, data }: NodeProps<CellFlowNode>) {
  const { address, value, label, isInput, isOutput, isMarked, isPercent } = data as CellNodeData
  const activeNodeIds = useFlowStore(s => s.activeNodeIds)
  const hasMainPath = useFlowStore(s => s.hasMainPath)
  const mainPathNodeIds = useFlowStore(s => s.mainPathNodeIds)
  const { numberDecimals, percentMode, percentDecimals } = useFlowStore(s => s.displaySettings)
  const isActive = activeNodeIds.has(id)
  const isOnMainPath = !hasMainPath || mainPathNodeIds.has(id)
  const nodeOpacity = isOnMainPath ? 1 : 0.32

  // ── Card state variants ────────────────────────────────────────────────────
  const isStart  = isMarked && !isOutput
  const isEnd    = isMarked && isOutput

  // Whether this node should receive the main-path glow animation
  const showMainGlow = hasMainPath && isOnMainPath && !isActive

  let borderCls: string, topBarCls: string, valueCls: string, glowCls: string, cardBgCls: string, titleCls: string, dividerCls: string, ringCls: string
  if (isActive) {
    borderCls  = 'border-lpf-border-light'
    topBarCls  = isEnd ? 'bg-emerald-500' : isStart ? 'bg-amber-500' : isPercent ? 'bg-sky-700/70' : 'bg-lpf-subtle'
    valueCls   = isEnd ? 'text-emerald-300' : isStart ? 'text-amber-300' : 'text-lpf-text'
    glowCls    = 'shadow-[0_8px_24px_rgba(0,0,0,0.08)]'
    cardBgCls  = 'bg-[#e8e8e8]'
    titleCls   = 'text-lpf-text'
    dividerCls = 'bg-black/6'
    ringCls    = 'ring-black/8'
  } else if (isEnd) {
    borderCls  = showMainGlow ? 'border-emerald-400/90' : 'border-emerald-500/60'
    topBarCls  = 'bg-emerald-500'
    valueCls   = 'text-emerald-600'
    glowCls    = showMainGlow ? 'main-path-glow-end' : 'shadow-[0_0_14px_rgba(16,185,129,0.18)]'
    cardBgCls  = 'bg-lpf-card'
    titleCls   = 'text-lpf-text'
    dividerCls = 'bg-black/6'
    ringCls    = 'ring-emerald-200/60'
  } else if (isStart) {
    borderCls  = showMainGlow ? 'border-amber-400/90' : 'border-amber-500/60'
    topBarCls  = 'bg-amber-500'
    valueCls   = 'text-amber-600'
    glowCls    = showMainGlow ? 'main-path-glow-start' : 'shadow-[0_0_14px_rgba(245,158,11,0.18)]'
    cardBgCls  = 'bg-lpf-card'
    titleCls   = 'text-lpf-text'
    dividerCls = 'bg-black/6'
    ringCls    = 'ring-amber-200/60'
  } else if (showMainGlow) {
    borderCls  = 'border-indigo-300/70'
    topBarCls  = isPercent ? 'bg-sky-500/80' : 'bg-indigo-400/70'
    valueCls   = 'text-lpf-text'
    glowCls    = 'main-path-glow-mid'
    cardBgCls  = 'bg-lpf-card'
    titleCls   = 'text-lpf-text'
    dividerCls = 'bg-black/5'
    ringCls    = 'ring-indigo-200/50'
  } else {
    borderCls  = 'border-lpf-border hover:border-lpf-border-light'
    topBarCls  = isPercent ? 'bg-sky-700/70' : 'bg-lpf-subtle'
    valueCls   = 'text-lpf-text'
    glowCls    = 'hover:shadow-glow'
    cardBgCls  = 'bg-lpf-card'
    titleCls   = 'text-lpf-text'
    dividerCls = 'bg-white/5'
    ringCls    = 'ring-white/20'
  }

  // ── Badge ──────────────────────────────────────────────────────────────────
  let badge: { text: string; cls: string } | null = null
  if (isStart)                  badge = { text: '起点', cls: 'bg-amber-900/50 text-amber-300 border-amber-700/50' }
  else if (isEnd)               badge = { text: '终点', cls: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' }
  else if (!isMarked && isInput)  badge = { text: '输入', cls: 'bg-white/5 text-white/50 border-white/10' }
  else if (!isMarked && isOutput) badge = { text: '结果', cls: 'bg-sky-900/40 text-sky-300/80 border-sky-700/30' }

  const displayValue = formatValue(value, isPercent, numberDecimals, percentMode, percentDecimals)
  const hasLabel = !!label

  return (
    <div
      className={[
        'relative rounded-xl border overflow-hidden',
        'min-w-[172px] max-w-[236px]',
        'transition-all duration-300 cursor-default select-none',
        'backdrop-blur-sm',
        cardBgCls,
        borderCls,
        glowCls,
      ].join(' ')}
      style={{ opacity: nodeOpacity }}
    >
      {/* Input handle */}
      {!isInput && (
        <Handle type="target" position={Position.Left}
          className="!border-lpf-subtle !bg-lpf-bg !w-2.5 !h-2.5" />
      )}

      {/* Accent top bar — thicker on main path */}
      <div className={`${showMainGlow ? 'h-[3px]' : 'h-[2px]'} w-full ${topBarCls} transition-all duration-300`} />

      {/* Body */}
      <div className="px-3.5 pt-2.5 pb-3">

        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            {hasLabel
              ? <p className={`text-[13px] font-semibold leading-tight truncate ${titleCls}`} title={label!}>{label}</p>
              : <p className="text-[11px] font-mono text-lpf-muted">{address}</p>
            }
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {badge && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm border uppercase tracking-wider ${badge.cls}`}>
                {badge.text}
              </span>
            )}
            {hasLabel && (
              <span className="font-mono text-[10px] text-lpf-subtle">{address}</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className={`h-px ${dividerCls} mb-2.5`} />

        {/* Value */}
        <div className={`text-[22px] font-bold font-mono tracking-tight leading-none transition-colors duration-300 ${valueCls}`}>
          {displayValue}
        </div>

        {/* Percent type indicator */}
        {isPercent && !isMarked && (
          <div className="mt-1.5 text-[9px] text-sky-600/70 uppercase tracking-wider font-medium">参数</div>
        )}
      </div>

      {/* Main path steady ring (non-active) */}
      {showMainGlow && (
        <div className={`absolute inset-0 rounded-xl ring-1 ${ringCls} pointer-events-none`} />
      )}

      {/* Active ring */}
      {isActive && (
        <div className={`absolute inset-0 rounded-xl ring-1 ${ringCls} pointer-events-none`} />
      )}

      {/* Output handle */}
      <Handle type="source" position={Position.Right}
        className="!border-lpf-subtle !bg-lpf-bg !w-2.5 !h-2.5" />
    </div>
  )
})
