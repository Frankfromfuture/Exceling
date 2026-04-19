import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { accent, ink } from '../../design'
import type { FlowEdgeData } from '../../types'
import { OPERATOR_ACCENTS, OPERATOR_LABELS } from '../../types'

function inferPositions(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const dx = targetX - sourceX
  const dy = targetY - sourceY

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourcePos: Position.Right, targetPos: Position.Left }
      : { sourcePos: Position.Left, targetPos: Position.Right }
  }

  return dy >= 0
    ? { sourcePos: Position.Bottom, targetPos: Position.Top }
    : { sourcePos: Position.Top, targetPos: Position.Bottom }
}

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const operator = data?.operator ?? '+'
  const stroke = accent[OPERATOR_ACCENTS[operator]]
  const { sourcePos, targetPos } = inferPositions(sourceX, sourceY, targetX, targetY)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePos,
    targetX,
    targetY,
    targetPosition: targetPos,
  })

  return (
    <>
      <defs>
        <marker
          id={`edge-arrow-${id}`}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={stroke} />
        </marker>
      </defs>

      <BaseEdge
        path={edgePath}
        markerEnd={`url(#edge-arrow-${id})`}
        style={{
          stroke,
          strokeWidth: operator === '*' ? 2 : 1.25,
          strokeDasharray: operator === '-' ? '4 2' : undefined,
          opacity: selected ? 1 : 0.92,
        }}
      />

      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <div
            className="flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 font-mono text-[11px] font-medium"
            style={{
              backgroundColor: ink[0],
              borderColor: ink[200],
              color: ink[700],
            }}
          >
            {OPERATOR_LABELS[operator]}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
