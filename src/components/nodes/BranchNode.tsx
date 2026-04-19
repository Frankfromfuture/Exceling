import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { accent } from '../../design'
import type { BranchFlowNode, BranchNodeData } from '../../types'

export const BranchNode = memo(function BranchNode({ data, selected }: NodeProps<BranchFlowNode>) {
  const branchData = data as BranchNodeData

  return (
    <div
      className={[
        'relative min-w-36 rounded-md bg-ink-0 pl-4 pr-3 pt-3 pb-3 transition-colors duration-default',
        selected ? 'border-2 border-ink-900' : 'border border-ink-200 hover:border-ink-300',
      ].join(' ')}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-md"
        style={{ backgroundColor: accent.slate }}
      />

      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <p className="text-xs font-medium uppercase tracking-label text-ink-500">Branch</p>
      <p className="mt-2 text-sm font-medium text-ink-800">{branchData.condition}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-600">
        <div className="rounded-sm border border-ink-200 bg-ink-50 px-2 py-2">
          <p className="font-medium text-ink-800">True</p>
          <p className="mt-1 break-all">{branchData.trueLabel}</p>
        </div>
        <div className="rounded-sm border border-ink-200 bg-ink-50 px-2 py-2">
          <p className="font-medium text-ink-800">False</p>
          <p className="mt-1 break-all">{branchData.falseLabel}</p>
        </div>
      </div>
    </div>
  )
})
