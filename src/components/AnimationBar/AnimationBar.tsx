import { Play, Pause, RotateCcw, Gauge, LayoutGrid } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'
import type { AnimationStatus } from '../../types'

const SPEEDS = [0.5, 1, 1.5, 2]

function StatusDot({ status }: { status: AnimationStatus }) {
  const map: Record<AnimationStatus, { label: string; dot: string; text: string }> = {
    idle:    { label: '待播放',  dot: 'bg-lpf-subtle',  text: 'text-lpf-muted' },
    playing: { label: '播放中',  dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-400' },
    paused:  { label: '已暂停',  dot: 'bg-amber-400',   text: 'text-amber-400' },
    done:    { label: '播放完毕', dot: 'bg-lpf-muted',   text: 'text-lpf-muted' },
  }
  const { label, dot, text } = map[status]
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className={`text-xs font-medium ${text}`}>{label}</span>
    </div>
  )
}

export function AnimationBar() {
  const {
    animationStatus, speed, animationStep, animationSteps,
    playAnimation, pauseAnimation, resetAnimation, setSpeed,
    fileName, resetFlow, relayoutFlow, nodes,
  } = useFlowStore()

  const progress = animationSteps.length
    ? Math.round((animationStep / animationSteps.length) * 100)
    : 0

  const isPlaying = animationStatus === 'playing'
  const isDone    = animationStatus === 'done'
  const canPlay   = animationSteps.length > 0

  const btnBase = 'flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150'
  const btnOn   = `${btnBase} border-white/15 bg-white/5 hover:bg-white/10 text-lpf-text`
  const btnOff  = `${btnBase} border-lpf-border bg-transparent text-lpf-subtle cursor-not-allowed`

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-5 py-2.5 rounded-xl border border-lpf-border bg-lpf-surface/95 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.6)]">

      {/* File + status */}
      <div className="flex flex-col min-w-0 max-w-[140px]">
        <p className="text-[11px] text-lpf-subtle truncate font-mono" title={fileName ?? ''}>{fileName ?? '—'}</p>
        <StatusDot status={animationStatus} />
      </div>

      <div className="w-px h-7 bg-lpf-border" />

      {/* Progress */}
      <div className="flex flex-col gap-1 w-24">
        <div className="h-1 bg-lpf-border rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-lpf-subtle text-right font-mono">
          {animationStep}/{animationSteps.length}
        </span>
      </div>

      <div className="w-px h-7 bg-lpf-border" />

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={isPlaying ? pauseAnimation : playAnimation}
          disabled={!canPlay}
          className={canPlay ? btnOn : btnOff}
          title={isPlaying ? '暂停' : isDone ? '重新播放' : '播放'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={resetAnimation}
          disabled={animationStatus === 'idle'}
          className={animationStatus !== 'idle' ? btnOn : btnOff}
          title="重置"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-7 bg-lpf-border" />

      {/* Speed */}
      <div className="flex items-center gap-1.5">
        <Gauge className="w-3 h-3 text-lpf-subtle shrink-0" />
        <div className="flex gap-0.5">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={[
                'text-[10px] font-mono px-1.5 py-1 rounded transition-all duration-100',
                speed === s
                  ? 'bg-white/12 text-lpf-text border border-white/15'
                  : 'text-lpf-subtle hover:text-lpf-muted',
              ].join(' ')}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="w-px h-7 bg-lpf-border" />

      {/* Re-layout */}
      <button
        onClick={relayoutFlow}
        disabled={nodes.length === 0}
        className={nodes.length > 0 ? btnOn : btnOff}
        title="重新整理布局"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-7 bg-lpf-border" />

      <button
        onClick={resetFlow}
        className="text-[11px] text-lpf-subtle hover:text-lpf-muted transition-colors px-1 font-mono"
      >
        换文件
      </button>
    </div>
  )
}
