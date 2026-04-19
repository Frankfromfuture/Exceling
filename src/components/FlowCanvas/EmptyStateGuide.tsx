import { Plus } from 'lucide-react'

export function EmptyStateGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-ink-300">
        <Plus className="h-6 w-6" strokeWidth={1.5} />
        <p className="text-sm font-medium">从左侧拖入节点开始</p>
      </div>
    </div>
  )
}
