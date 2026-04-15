import { memo } from 'react'
import {
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import type { FlowEdgeData } from '../../types'
import { OPERATOR_COLORS } from '../../types'
import { useFlowStore } from '../../store/flowStore'

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const activeEdgeIds   = useFlowStore(s => s.activeEdgeIds)
  const hasMainPath     = useFlowStore(s => s.hasMainPath)
  const mainPathEdgeIds = useFlowStore(s => s.mainPathEdgeIds)
  const animationStatus = useFlowStore(s => s.animationStatus)
  const isActive = activeEdgeIds.has(id)
  const isOnMainPath = !hasMainPath || mainPathEdgeIds.has(id)
  const isMainPath = hasMainPath && isOnMainPath
  const isPlaying  = animationStatus !== 'idle'
  // During playback, completely hide non-main-path edges
  const isHidden   = isPlaying && hasMainPath && !isOnMainPath

  const operator = data?.operator ?? '+'
  const color = OPERATOR_COLORS[operator] ?? '#8b5cf6'

  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    curvature: 0.3,
  })

  // Sizing tiers
  const baseW     = isActive ? 4   : isMainPath ? 5   : 2.5
  const dashW     = isActive ? 6   : isMainPath ? 8   : 3
  const dashGap   = isMainPath ? '14 5' : '10 6'
  const flowSpeed = isMainPath ? '0.45s' : '1.2s'
  const baseOpacity  = isMainPath ? 0.28 : (isOnMainPath ? 0.18 : 0.05)
  const dashOpacity  = isActive ? 0.95 : isMainPath ? 0.88 : (isOnMainPath ? 0.55 : 0.14)
  const arrowOpacity = isActive ? 0.92 : isMainPath ? 0.82 : (isOnMainPath ? 0.52 : 0.14)
  const arrowSize    = isMainPath ? 7 : 5

  return (
    <g style={{ opacity: isHidden ? 0 : 1, transition: 'opacity 0.35s ease' }}>
      {/* ── Glow halo — main path only ── */}
      {isMainPath && (
        <path
          d={edgePath}
          stroke={color}
          strokeWidth={20}
          strokeLinecap="round"
          fill="none"
          strokeOpacity={0.07}
        />
      )}

      {/* ── Base path ── */}
      <path
        d={edgePath}
        stroke={color}
        strokeWidth={baseW}
        strokeLinecap="round"
        fill="none"
        strokeOpacity={baseOpacity}
        style={{ transition: 'stroke-width 0.4s, stroke-opacity 0.4s' }}
      />

      {/* ── Animated flowing dashes ── */}
      <path
        d={edgePath}
        stroke={color}
        strokeWidth={dashW}
        fill="none"
        strokeOpacity={dashOpacity}
        strokeDasharray={dashGap}
        strokeLinecap="round"
        style={{
          animation: `flow ${flowSpeed} linear infinite`,
          filter: isActive
            ? `drop-shadow(0 0 5px ${color})`
            : isMainPath
              ? `drop-shadow(0 0 3px ${color}bb)`
              : 'none',
          transition: 'stroke-opacity 0.4s, stroke-width 0.4s',
        }}
      />

      {/* ── Arrow head ── */}
      <defs>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="4.5"
          refY="5"
          markerWidth={arrowSize}
          markerHeight={arrowSize}
          orient="auto-start-reverse"
        >
          <path
            d="M 1 2 L 7 5 L 1 8"
            fill="none"
            stroke={color}
            strokeWidth={isMainPath ? 1.8 : 1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={arrowOpacity}
          />
        </marker>
      </defs>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={isMainPath ? 6 : 4}
        markerEnd={`url(#arrow-${id})`}
      />
    </g>
  )
})
