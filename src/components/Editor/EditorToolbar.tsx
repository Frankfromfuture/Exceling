import { Download, FileText, Redo2, Undo2 } from 'lucide-react'

interface EditorToolbarProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onExport: () => void
}

function ToolbarButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-sm border border-ink-300 bg-ink-0 px-3 text-sm font-medium text-ink-900 transition-colors duration-default hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
}: EditorToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-ink-200 bg-ink-0 px-4">
      <div className="flex items-center gap-3">
        <div className="text-sm font-bold text-ink-900">Exceling</div>
        <div className="hidden h-4 w-px bg-ink-200 sm:block" />
        <label className="hidden items-center gap-2 sm:flex">
          <FileText className="h-4 w-4 text-ink-500" strokeWidth={1.5} />
          <select
            defaultValue="blank"
            className="h-8 rounded-sm border border-ink-300 bg-ink-0 px-3 text-sm text-ink-700 outline-none transition-colors duration-default focus:border-ink-900"
          >
            <option value="blank">Blank template</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <ToolbarButton
          label="Undo"
          icon={<Undo2 className="h-4 w-4" strokeWidth={1.5} />}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <ToolbarButton
          label="Redo"
          icon={<Redo2 className="h-4 w-4" strokeWidth={1.5} />}
          disabled={!canRedo}
          onClick={onRedo}
        />
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-8 items-center gap-2 rounded-sm bg-ink-900 px-3 text-sm font-medium text-ink-0 transition-colors duration-default hover:bg-ink-1000"
        >
          <Download className="h-4 w-4" strokeWidth={1.5} />
          <span>导出 Excel</span>
        </button>
      </div>
    </div>
  )
}
