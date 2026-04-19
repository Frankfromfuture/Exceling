import {
  Circle,
  CircleDot,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Square,
  Triangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NodeType } from '../../types'

interface PaletteItem {
  type: NodeType
  label: string
  description: string
  icon: LucideIcon
  data?: Record<string, unknown>
}

const PALETTE_GROUPS: Array<{
  title: string
  items: PaletteItem[]
}> = [
  {
    title: 'Inputs',
    items: [
      {
        type: 'cellNode',
        label: 'Input Node',
        description: 'Manual value entry',
        icon: CircleDot,
        data: { label: 'Input', isInput: true, isOutput: false, value: 0 },
      },
      {
        type: 'constantNode',
        label: 'Constant',
        description: 'Fixed numeric value',
        icon: Triangle,
        data: { label: 'Constant', value: 0 },
      },
      {
        type: 'cellNode',
        label: 'Output Node',
        description: 'Final result cell',
        icon: Circle,
        data: { label: 'Result', isInput: false, isOutput: true, value: 0 },
      },
    ],
  },
  {
    title: 'Logic',
    items: [
      {
        type: 'cellNode',
        label: 'Step Node',
        description: 'Intermediate calculation',
        icon: Square,
        data: { label: 'Step', isInput: false, isOutput: false, value: 0 },
      },
      {
        type: 'operatorNode',
        label: 'Operator',
        description: 'Math transform node',
        icon: Plus,
      },
      {
        type: 'branchNode',
        label: 'Branch',
        description: 'Conditional branch',
        icon: GitBranch,
      },
    ],
  },
]

interface NodePaletteProps {
  collapsed?: boolean
  onToggle?: () => void
}

function dragNode(event: React.DragEvent, type: NodeType, data?: Record<string, unknown>) {
  event.dataTransfer.setData(
    'application/exceling-node',
    JSON.stringify({ type, data: data ?? {} }),
  )
  event.dataTransfer.effectAllowed = 'move'
}

export function NodePalette({ collapsed = false, onToggle }: NodePaletteProps) {
  return (
    <aside
      className={[
        'relative flex shrink-0 flex-col border-r border-ink-200 bg-ink-50 transition-all duration-slow',
        collapsed ? 'w-12' : 'w-[240px]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-sm border border-ink-200 bg-ink-0 text-ink-500 transition-colors duration-default hover:bg-ink-100 hover:text-ink-800"
        aria-label={collapsed ? 'Expand node palette' : 'Collapse node palette'}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      {collapsed ? (
        <div className="flex flex-col items-center gap-2 px-2 pt-14">
          {PALETTE_GROUPS.flatMap((group) => group.items).map((item) => {
            const Icon = item.icon
            return (
              <button
                key={`${item.type}-${item.label}`}
                type="button"
                draggable
                onDragStart={(event) => dragNode(event, item.type, item.data)}
                className="flex h-8 w-8 cursor-grab items-center justify-center rounded-sm border border-ink-200 bg-ink-0 text-ink-700 transition-colors duration-default hover:bg-ink-100 active:cursor-grabbing"
                title={item.label}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto pt-12">
          {PALETTE_GROUPS.map((group, groupIndex) => (
            <section
              key={group.title}
              className={groupIndex === 0 ? '' : 'border-t border-ink-200'}
            >
              <header className="px-4 py-3 text-xs font-medium uppercase tracking-label text-ink-500">
                {group.title}
              </header>
              <div className="space-y-2 px-4 pb-4">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={`${item.type}-${item.label}`}
                      type="button"
                      draggable
                      onDragStart={(event) => dragNode(event, item.type, item.data)}
                      className="flex w-full cursor-grab items-start gap-3 rounded-md border border-ink-200 bg-ink-0 px-3 py-3 text-left transition-colors duration-default hover:border-ink-300 hover:bg-ink-100 active:cursor-grabbing"
                    >
                      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-sm border border-ink-200 bg-ink-50 text-ink-700">
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink-800">{item.label}</span>
                        <span className="block text-xs leading-body text-ink-500">{item.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}
