import { useEffect, useRef } from 'react'
import type { XYPosition } from '@xyflow/react'
import { useFlowStore } from '../../store/flowStore'

export interface ContextMenuState {
  screenX: number
  screenY: number
  flowPosition: XYPosition
  targetNodeId: string | null
  targetEdgeId: string | null
}

interface ContextMenuProps {
  state: ContextMenuState
  onClose: () => void
}

function MenuItem({
  label,
  danger,
  onClick,
}: {
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors duration-default',
        danger ? 'text-status-err hover:bg-ink-100' : 'text-ink-700 hover:bg-ink-100',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export function ContextMenu({ state, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const addNode = useFlowStore((store) => store.addNode)
  const removeNode = useFlowStore((store) => store.removeNode)
  const removeEdge = useFlowStore((store) => store.removeEdge)
  const updateNodeData = useFlowStore((store) => store.updateNodeData)
  const nodes = useFlowStore((store) => store.nodes)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (state.targetNodeId) {
    const node = nodes.find((item) => item.id === state.targetNodeId)
    const isCellNode = node?.type === 'cellNode'
    const cellData = isCellNode ? (node.data as Record<string, unknown>) : null

    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[176px] rounded-lg border border-ink-200 bg-ink-0 py-1"
        style={{ left: state.screenX, top: state.screenY }}
      >
        {isCellNode && cellData && (
          <>
            <MenuItem
              label={cellData.isOutput ? '取消输出节点' : '标记为输出节点'}
              onClick={() => {
                updateNodeData(state.targetNodeId!, { isOutput: !cellData.isOutput })
                onClose()
              }}
            />
            <MenuItem
              label={cellData.isInput ? '取消输入节点' : '标记为输入节点'}
              onClick={() => {
                updateNodeData(state.targetNodeId!, { isInput: !cellData.isInput })
                onClose()
              }}
            />
            <div className="my-1 border-t border-ink-200" />
          </>
        )}
        <MenuItem
          label="删除节点"
          danger
          onClick={() => {
            removeNode(state.targetNodeId!)
            onClose()
          }}
        />
      </div>
    )
  }

  if (state.targetEdgeId) {
    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[176px] rounded-lg border border-ink-200 bg-ink-0 py-1"
        style={{ left: state.screenX, top: state.screenY }}
      >
        <MenuItem
          label="删除连线"
          danger
          onClick={() => {
            removeEdge(state.targetEdgeId!)
            onClose()
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[176px] rounded-lg border border-ink-200 bg-ink-0 py-1"
      style={{ left: state.screenX, top: state.screenY }}
    >
      <MenuItem
        label="添加输入节点"
        onClick={() => {
          addNode('cellNode', state.flowPosition, { label: 'Input', isInput: true, value: 0 })
          onClose()
        }}
      />
      <MenuItem
        label="添加步骤节点"
        onClick={() => {
          addNode('cellNode', state.flowPosition, { label: 'Step', isInput: false, value: 0 })
          onClose()
        }}
      />
      <MenuItem
        label="添加运算节点"
        onClick={() => {
          addNode('operatorNode', state.flowPosition)
          onClose()
        }}
      />
      <MenuItem
        label="添加常量节点"
        onClick={() => {
          addNode('constantNode', state.flowPosition, { label: 'Constant', value: 0 })
          onClose()
        }}
      />
    </div>
  )
}
