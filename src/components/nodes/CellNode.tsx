import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { memo } from 'react'
import { accent } from '../../design'
import type { CellFlowNode, CellNodeData } from '../../types'
import { useFlowStore } from '../../store/flowStore'
import { InlineLabel } from '../Editor/InlineLabel'

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const

function formatValue(value: number | string | null | undefined, isPercent: boolean) {
  if (value == null || value === '') return '--'
  if (typeof value === 'string') return value
  if (isPercent) return `${(value * 100).toFixed(2)}%`
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function getAccentColor(data: CellNodeData) {
  if (data.isOutput) return accent.mauve
  if (data.isInput) return accent.sage
  return accent.slate
}

function getRoleLabel(data: CellNodeData) {
  if (data.isOutput) return 'Output'
  if (data.isInput) return 'Input'
  return 'Step'
}

export const CellNode = memo(function CellNode({ id, data, selected }: NodeProps<CellFlowNode>) {
  const cellData = data as CellNodeData
  const updateNodeData = useFlowStore((store) => store.updateNodeData)
  const removeNode = useFlowStore((store) => store.removeNode)

  const displayValue = cellData.isInput ? cellData.value : (cellData.computedValue ?? cellData.value)
  const accentColor = getAccentColor(cellData)

  return (
    <div
      className={[
        'group relative min-w-36 rounded-md bg-ink-0 pl-4 pr-3 pt-3 pb-3 transition-colors duration-default',
        selected ? 'border-2 border-ink-900' : 'border border-ink-200 hover:border-ink-300',
      ].join(' ')}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-md"
        style={{ backgroundColor: accentColor }}
      />

      {SIDES.map((side) => (
        <Handle
          key={`target-${side.id}`}
          id={side.id}
          type="target"
          position={side.position}
          className="!opacity-0"
        />
      ))}

      {SIDES.map((side) => (
        <Handle
          key={`source-${side.id}`}
          id={side.id}
          type="source"
          position={side.position}
          className="!opacity-0"
        />
      ))}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-label text-ink-500">
            {getRoleLabel(cellData)}
          </p>
          <InlineLabel
            value={cellData.label ?? ''}
            placeholder={cellData.isInput ? 'Input' : 'Step'}
            className="px-0 py-0"
            onCommit={(value) => updateNodeData(id, { label: value })}
          />
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            removeNode(id)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-400 opacity-0 transition-colors duration-default hover:bg-ink-100 hover:text-ink-700 group-hover:opacity-100"
          aria-label="Delete node"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-3">
        {cellData.isInput ? (
          <input
            type="text"
            value={cellData.value ?? ''}
            onChange={(event) => updateNodeData(id, { value: event.target.value })}
            placeholder="0"
            className="h-8 w-full rounded-sm border border-ink-300 bg-ink-0 px-3 text-right font-mono text-base font-bold tabular-nums text-ink-900 outline-none transition-colors duration-default focus:border-ink-900"
          />
        ) : (
          <p className="font-mono text-[28px] font-bold leading-display tracking-display tabular-nums text-ink-900 transition-all duration-default">
            {formatValue(displayValue, cellData.isPercent)}
          </p>
        )}
      </div>

      {!cellData.isInput && cellData.computedFormula && (
        <p className="mt-2 max-w-52 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-ink-400">
          {cellData.computedFormula}
        </p>
      )}
    </div>
  )
})
