import { beforeEach, describe, expect, it } from 'vitest'
import { useFlowStore } from './flowStore'

describe('flowStore undo history', () => {
  beforeEach(() => {
    useFlowStore.getState().resetFlow()
  })

  it('boots in edit mode with an empty canvas', () => {
    const state = useFlowStore.getState()

    expect(state.mode).toBe('edit')
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
  })

  it('undoes and redoes node creation', () => {
    const store = useFlowStore.getState()
    const nodeId = store.addNode('cellNode', { x: 120, y: 180 }, { label: 'Revenue', isInput: true, value: 100 })

    expect(useFlowStore.getState().nodes.map((node) => node.id)).toContain(nodeId)

    store.undo()
    expect(useFlowStore.getState().nodes).toHaveLength(0)

    store.redo()
    const restoredNode = useFlowStore.getState().nodes.find((node) => node.id === nodeId)
    expect(restoredNode?.type).toBe('cellNode')
    expect(restoredNode?.data.label).toBe('Revenue')
  })

  it('undoes edge creation and node updates in reverse order', () => {
    const store = useFlowStore.getState()
    const inputId = store.addNode('cellNode', { x: 120, y: 180 }, { label: 'Revenue', isInput: true, value: 100 })
    const outputId = store.addNode('cellNode', { x: 360, y: 180 }, { label: 'Net Profit', isOutput: true, value: 0 })

    const edgeId = store.addEdge(inputId, outputId)
    expect(edgeId).not.toBeNull()
    expect(useFlowStore.getState().edges).toHaveLength(1)

    store.updateNodeData(inputId, { label: 'Revenue Input', value: 120 })
    expect(useFlowStore.getState().nodes.find((node) => node.id === inputId)?.data.label).toBe('Revenue Input')

    store.undo()
    expect(useFlowStore.getState().nodes.find((node) => node.id === inputId)?.data.label).toBe('Revenue')

    store.undo()
    expect(useFlowStore.getState().edges).toHaveLength(0)

    store.redo()
    expect(useFlowStore.getState().edges).toHaveLength(1)
  })
})
