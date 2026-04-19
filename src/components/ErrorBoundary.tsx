import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useFlowStore } from '../store/flowStore'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string | null
}

class ErrorBoundaryImpl extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || '未知渲染错误',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[exceling] render failure', error, errorInfo)
  }

  handleReset = () => {
    useFlowStore.getState().resetFlow()
    this.setState({ hasError: false, errorMessage: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-3xl border border-neutral-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.08)] p-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 font-bold mb-3">降级模式</p>
          <h1 className="text-2xl font-semibold text-neutral-900 mb-3">图形渲染暂时失败了</h1>
          <p className="text-sm leading-6 text-neutral-600 mb-6">
            当前会话已被安全中断，避免整个页面白屏。你可以回到上传页重新解析文件，继续排查问题。
          </p>
          {this.state.errorMessage && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900/80 mb-6">
              {this.state.errorMessage}
            </div>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
          >
            返回上传页
          </button>
        </div>
      </div>
    )
  }
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return <ErrorBoundaryImpl>{children}</ErrorBoundaryImpl>
}
