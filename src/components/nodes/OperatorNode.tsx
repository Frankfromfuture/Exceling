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
  const leftLiteral = literalOperands.find(item => item.side === 'left')
  const rightLiteral = literalOperands.find(item => item.side === 'right')

  return (
    <div className="relative flex items-center gap-2" style={{ opacity: nodeOpacity }}>
      {leftLiteral && (
        <span className="text-[11px] text-lpf-muted whitespace-nowrap min-w-[44px] text-right">
          {formatLiteralValue(leftLiteral.value, leftLiteral.isPercent)}
        </span>
      )}

      <div
        className={[
          'relative flex items-center justify-center rounded-full',
          'transition-all duration-500 cursor-default select-none',
          'border-2',
          isActive ? 'scale-110' : showMainGlow ? 'scale-105' : 'hover:scale-105',
        ].join(' ')}
        style={{
          width: showMainGlow ? 46 : 42,
          height: showMainGlow ? 46 : 42,
          borderColor: color,
          borderWidth: showMainGlow ? 2.5 : 2,
          background: isActive
            ? '#e8e8e8'
            : `radial-gradient(circle at 30% 30%, ${color}30, ${color}08 58%)`,
          boxShadow: isActive
            ? `0 0 0 2px ${color}30, 0 8px 18px rgba(0,0,0,0.08)`
            : showMainGlow
              ? `0 0 0 2px ${color}40, 0 0 18px ${color}30, 0 6px 16px rgba(0,0,0,0.10)`
              : `0 0 0 1px ${color}18, 0 6px 14px rgba(0,0,0,0.14)`,
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          style={{ borderColor: color, background: '#fafafa' }}
        />

        <span
          className="text-lg font-bold select-none transition-all duration-300"
          style={{
            color: isActive ? '#1a1a1a' : color,
            textShadow: isActive ? 'none' : showMainGlow ? `0 0 12px ${color}99` : `0 0 8px ${color}55`,
          }}
        >
          {label}
        </span>

        {/* Main path expanding pulse ring */}
        {showMainGlow && (
          <div
            className="op-ring-pulse absolute inset-0 rounded-full pointer-events-none"
            style={{ border: `2px solid ${color}` }}
          />
        )}

        {/* Active ping */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ border: `2px solid ${color}` }}
          />
        )}

        <Handle
          type="source"
          position={Position.Right}
          style={{ borderColor: color, background: '#fafafa' }}
        />
      </div>

      {rightLiteral && (
        <span className="text-[11px] text-lpf-muted whitespace-nowrap min-w-[44px]">
          {formatLiteralValue(rightLiteral.value, rightLiteral.isPercent)}
        </span>
      )}
    </div>
  )
})
