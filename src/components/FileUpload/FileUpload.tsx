import { useRef, useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react'
import { parseExcelFile } from '../../lib/excel/parseXlsx'
import { buildFlowGraph } from '../../lib/formula/buildGraph'
import { applyDagreLayout } from '../../lib/layout/autoLayout'
import { useFlowStore } from '../../store/flowStore'

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false)
  const [rangeInput, setRangeInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { isLoading, error, setLoading, setError, setFlowData } = useFlowStore()

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      setError('请上传 .xlsx 或 .xls 格式的 Excel 文件')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await parseExcelFile(file, rangeInput)
      const { nodes: rawNodes, edges } = buildFlowGraph(result.cells)
      const nodes = applyDagreLayout(rawNodes, edges)
      setFlowData(file.name, nodes, edges)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败，请检查文件格式')
    }
  }, [rangeInput, setLoading, setError, setFlowData])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  return (
    <div className="flex items-center justify-center w-full h-full bg-lpf-bg">
      {/* Subtle grid overlay */}
      <div className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(circle, #d0d0d0 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.55 }} />

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg w-full px-6">

        {/* Logo */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-lpf-card border border-lpf-border flex items-center justify-center">
              <span className="text-lpf-text font-bold text-sm font-mono">EX</span>
            </div>
            <h1 className="text-2xl font-bold text-lpf-text tracking-tight font-mono">
              exceling
            </h1>
          </div>
          <p className="text-lpf-subtle text-sm">从杂乱表格中找出计算主脉络，可视化呈现</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => !isLoading && inputRef.current?.click()}
          className={[
            'relative w-full border border-dashed rounded-xl p-10 cursor-pointer',
            'transition-all duration-200 text-center select-none',
            isDragging
              ? 'border-white/30 bg-white/5 scale-[1.01]'
              : 'border-lpf-border bg-lpf-surface hover:border-lpf-border-light hover:bg-lpf-card',
            isLoading ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
          <div className="flex flex-col items-center gap-3">
            {isLoading ? (
              <Loader2 className="w-10 h-10 text-lpf-muted animate-spin" />
            ) : (
              <div className={[
                'w-14 h-14 rounded-xl border flex items-center justify-center transition-all duration-200',
                isDragging ? 'border-white/20 bg-white/8' : 'border-lpf-border bg-lpf-card',
              ].join(' ')}>
                {isDragging
                  ? <FileSpreadsheet className="w-7 h-7 text-lpf-text" />
                  : <Upload className="w-7 h-7 text-lpf-muted" />}
              </div>
            )}
            <div>
              <p className="text-lpf-text font-medium">
                {isLoading ? '正在解析...' : isDragging ? '释放以上传' : '拖拽或点击上传'}
              </p>
              <p className="text-lpf-subtle text-sm mt-0.5">支持 .xlsx .xls 格式</p>
            </div>
          </div>
        </div>

        {/* Range input */}
        <div className="w-full">
          <label className="block text-xs text-lpf-muted mb-1.5">
            手动指定范围 <span className="text-lpf-subtle">（可选，留空则默认分析第一工作表全部已用单元格）</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={rangeInput}
              onChange={e => setRangeInput(e.target.value.toUpperCase())}
              placeholder="例：B2:C14"
              spellCheck={false}
              className={[
                'flex-1 bg-lpf-surface border rounded-lg px-3 py-2 text-sm font-mono',
                'text-lpf-text placeholder-lpf-subtle outline-none',
                'transition-colors duration-150',
                rangeInput
                  ? 'border-white/20 focus:border-white/30'
                  : 'border-lpf-border focus:border-lpf-border-light',
              ].join(' ')}
            />
            {rangeInput && (
              <button
                onClick={() => setRangeInput('')}
                className="text-lpf-subtle hover:text-lpf-muted text-xs px-2 py-2 rounded-lg transition-colors"
              >✕</button>
            )}
          </div>
          {!rangeInput && (
            <p className="text-[11px] text-lpf-subtle mt-1">
              留空时将默认分析第一工作表全部已用单元格
            </p>
          )}
          {rangeInput && (
            <p className="text-[11px] text-lpf-subtle mt-1 font-mono">
              分析第一工作表 {rangeInput} 区域
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="w-full flex gap-3 items-start bg-red-950/40 border border-red-800/40 rounded-xl p-4 text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300/90 whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* Tips */}
        <div className="w-full bg-lpf-surface border border-lpf-border rounded-xl p-4 text-xs text-lpf-subtle space-y-1.5">
          <p className="text-lpf-muted font-medium mb-2">使用说明</p>
          <p>① 在 Excel 中将<strong className="text-lpf-muted">起始数据</strong>和<strong className="text-lpf-muted">最终结果</strong>单元格设为紫色填充</p>
          <p>② 上传文件，自动扫描全表公式依赖，推断 <span className="text-amber-400">起点</span> / <span className="text-emerald-400">终点</span>，高亮主脉络</p>
          <p>③ 非主脉络节点半透明降权，说明框同步输出自然语言描述</p>
          <p>④ 如需限定分析范围，可手动填写区域（如 B2:C14）</p>
        </div>
      </div>
    </div>
  )
}
