import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { OperatorFlowNode, OperatorNodeData } from '../../types'
import { OPERATOR_COLORS, OPERATOR_LABELS } from '../../types'
import { useFlowStore } from '../../store/flowStore'

function formatLiteralValue(value: number | string, isPercent: boolean) {
  if (typeof value === 'string') return value
  if (isPercent) {
    return (value * 100).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + '%'
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export const OperatorNode = memo(function OperatorNode({ id, data }: NodeProps<OperatorFlowNode>) {
  const { operator, literalOperands } = data as OperatorNodeData
  const activeNodeIds = useFlowStore(s => s.activeNodeIds)
  const hasMainPath = useFlowStore(s => s.hasMainPath)
  const mainPathNodeIds = useFlowStore(s => s.mainPathNodeIds)
  const isActive = activeNodeIds.has(id)
  const isOnMainPath = !hasMainPath || mainPathNodeIds.has(id)
  const nodeOpacity = isOnMainPath ? 1 : 0.32
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
        width: 72,
        height: hasLiterals ? 56 : 44,
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
        <div className="flex items-center gap-1 mt-1 mb-1">
          {leftLiteral && (
            <span
              className="leading-none whitespace-nowrap"
              style={{ fontSize: 10, color: `${color}cc` }}
            >
              {formatLiteralValue(leftLiteral.value, leftLiteral.isPercent)}
            </span>
          )}
          {leftLiteral && rightLiteral && (
            <span style={{ fontSize: 9, color: `${color}66` }}>·</span>
          )}
          {rightLiteral && (
            <span
              className="leading-none whitespace-nowrap"
              style={{ fontSize: 10, color: `${color}cc` }}
            >
              {formatLiteralValue(rightLiteral.value, rightLiteral.isPercent)}
            </span>
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
