import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { OperatorFlowNode, OperatorNodeData } from '../../types'
import { OPERATOR_COLORS, OPERATOR_LABELS } from '../../types'
import { useFlowStore } from '../../store/flowStore'

/** Render a literal operand value — large number, % as raised superscript */
function LiteralValue({ value, isPercent, color }: {
  value: number | string
  isPercent: boolean
  color: string
}) {
  if (typeof value === 'string') {
    return (
      <span style={{ fontSize: 13, fontWeight: 600, color: `${color}dd`, lineHeight: 1 }}>
        {value}
      </span>
    )
  }

  if (isPercent) {
    const numStr = (value * 100).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return (
      <span className="inline-flex items-start whitespace-nowrap leading-none">
        <span style={{ fontSize: 14, fontWeight: 700, color: `${color}ee`, lineHeight: 1 }}>
          {numStr}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: `${color}bb`, lineHeight: 1, marginTop: 1, marginLeft: 1 }}>
          %
        </span>
      </span>
    )
  }

  const numStr = value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: `${color}dd`, lineHeight: 1 }}>
      {numStr}
    </span>
  )
}

export const OperatorNode = memo(function OperatorNode({ id, data }: NodeProps<OperatorFlowNode>) {
  const { operator, literalOperands } = data as OperatorNodeData
  const activeNodeIds   = useFlowStore(s => s.activeNodeIds)
  const hasMainPath     = useFlowStore(s => s.hasMainPath)
  const mainPathNodeIds = useFlowStore(s => s.mainPathNodeIds)
  const animationStatus = useFlowStore(s => s.animationStatus)
  const isActive = activeNodeIds.has(id)
  const isOnMainPath = !hasMainPath || mainPathNodeIds.has(id)
  const isPlaying = animationStatus !== 'idle'
  const nodeOpacity = isPlaying && hasMainPath && !isOnMainPath ? 0 : isOnMainPath ? 1 : 0.32
  const showMainGlow = hasMainPath && isOnMainPath && !isActive

  const color = OPERATOR_COLORS[operator]
  const label = OPERATOR_LABELS[operator]
  const leftLiteral  = literalOperands.find(item => item.side === 'left')
  const rightLiteral = literalOperands.find(item => item.side === 'right')
  const hasLiterals  = !!(leftLiteral || rightLiteral)

  return (
    <div
      className={[
        'relative flex flex-col items-center justify-center',
        'transition-all duration-500 cursor-default select-none',
        isActive ? 'scale-110' : showMainGlow ? 'scale-105' : 'hover:scale-105',
      ].join(' ')}
      style={{
        width: 76,
        height: hasLiterals ? 62 : 44,
        borderRadius: 10,
        border: `${showMainGlow ? 2.5 : 2}px solid ${color}`,
        background: isActive
          ? '#e8e8e8'
          : `linear-gradient(160deg, ${color}28 0%, ${color}08 100%)`,
        boxShadow: isActive
          ? `0 0 0 2px ${color}30, 0 8px 18px rgba(0,0,0,0.08)`
          : showMainGlow
            ? `0 0 0 2px ${color}40, 0 0 20px ${color}35, 0 6px 16px rgba(0,0,0,0.10)`
            : `0 0 0 1px ${color}18, 0 4px 12px rgba(0,0,0,0.12)`,
        opacity: nodeOpacity,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ borderColor: color, background: '#fafafa' }}
      />

      {/* Operator symbol */}
      <span
        className="font-bold leading-none select-none transition-all duration-300"
        style={{
          fontSize: hasLiterals ? 17 : 20,
          marginTop: hasLiterals ? 4 : 0,
          color: isActive ? '#1a1a1a' : color,
          textShadow: isActive
            ? 'none'
            : showMainGlow
              ? `0 0 12px ${color}99`
              : `0 0 8px ${color}55`,
        }}
      >
        {label}
      </span>

      {/* Literal constants row */}
      {hasLiterals && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {leftLiteral && (
            <LiteralValue value={leftLiteral.value} isPercent={leftLiteral.isPercent} color={color} />
          )}
          {leftLiteral && rightLiteral && (
            <span style={{ fontSize: 8, color: `${color}55` }}>·</span>
          )}
          {rightLiteral && (
            <LiteralValue value={rightLiteral.value} isPercent={rightLiteral.isPercent} color={color} />
          )}
        </div>
      )}

      {/* Main path expanding pulse ring */}
      {showMainGlow && (
        <div
          className="op-ring-pulse absolute inset-0 pointer-events-none"
          style={{ border: `2px solid ${color}`, borderRadius: 10 }}
        />
      )}

      {/* Active ping */}
      {isActive && (
        <div
          className="absolute inset-0 animate-ping opacity-30 pointer-events-none"
          style={{ border: `2px solid ${color}`, borderRadius: 10 }}
        />
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ borderColor: color, background: '#fafafa' }}
      />
    </div>
  )
})
