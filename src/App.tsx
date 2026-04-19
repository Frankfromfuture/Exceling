import { FlowCanvas } from './components/FlowCanvas/FlowCanvas'

export default function App() {
  return (
    <div className="h-screen overflow-hidden bg-ink-50 text-ink-700">
      <main className="h-full">
        <FlowCanvas />
      </main>
    </div>
  )
}
