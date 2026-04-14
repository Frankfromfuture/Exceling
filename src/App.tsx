import { ExternalLink } from 'lucide-react'
import { FileUpload } from './components/FileUpload/FileUpload'
import { FlowCanvas } from './components/FlowCanvas/FlowCanvas'
import { useFlowStore } from './store/flowStore'

function Header() {
  const { fileName, nodes } = useFlowStore()
  const hasData = nodes.length > 0
  const cellCount = nodes.filter(n => n.type === 'cellNode').length

  return (
    <header className="flex items-center justify-between px-5 h-12 border-b border-lpf-border bg-lpf-surface shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-lpf-card border border-lpf-border flex items-center justify-center">
          <span className="text-lpf-text font-bold text-[10px] font-mono">EX</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-lpf-text text-sm tracking-tight">exceling</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-lpf-card text-lpf-subtle border border-lpf-border font-mono">
            v0.1
          </span>
        </div>
      </div>

      {/* File info */}
      {hasData && fileName && (
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-lpf-muted max-w-[220px] truncate">{fileName}</span>
          <span className="text-lpf-subtle">·</span>
          <span className="text-lpf-subtle">{cellCount} cells</span>
        </div>
      )}

      {/* GitHub */}
      <a
        href="https://github.com/your-org/LPF"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-lpf-subtle hover:text-lpf-muted transition-colors px-2 py-1.5 rounded hover:bg-lpf-card"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span>GitHub</span>
      </a>
    </header>
  )
}

export default function App() {
  const { nodes } = useFlowStore()
  const hasData = nodes.length > 0

  return (
    <div className="flex flex-col h-screen bg-lpf-bg overflow-hidden">
      <Header />
      <main className="flex-1 relative overflow-hidden">
        {hasData ? <FlowCanvas /> : <FileUpload />}
      </main>
    </div>
  )
}
