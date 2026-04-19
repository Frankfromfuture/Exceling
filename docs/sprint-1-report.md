# Sprint 1 Report

## 完成项

- 1.1 新建 `src/design/tokens.ts` 与 `src/design/index.ts`，落地 `ink` / `accent` / `status` / `focus` / `type` / `space` / `radius` / `motion`
- 1.2 用 token 重建 Tailwind 主题，删除旧 `tailwind.config.js`，新增 `tailwind.config.ts`
- 1.3 重写 `src/index.css`，注入 `:root` CSS 变量层并统一 React Flow 覆盖样式
- 1.4 新增 `src/design/tokens.test.ts`，校验 accent 饱和度与 ink lightness 单调性
- 1.5 重写 `src/components/Editor/NodePalette.tsx`，提供 240px 左侧节点面板与拖拽入口
- 1.6 重写 `src/components/Editor/EditorToolbar.tsx`，提供撤销 / 重做 / 模板下拉 / 导出 Excel
- 1.7 重写 `src/components/FlowCanvas/FlowCanvas.tsx`，接入 `onNodesChange` / `onEdgesChange` / `onConnect` / `onDrop` / `onDragOver`
- 1.8 重写 `src/store/flowStore.ts`，新增 `mode`、`addNode`、`removeNode`、`updateNodeData`、`addEdge`、`removeEdge`，并接入 `zundo`
- 1.9 在 `FlowCanvas` 内接入 `Ctrl+Z` / `Ctrl+Shift+Z` / `Delete` 键盘绑定
- 清理 Phase 0 遗留：删除空的 `src/components/AnimationBar`、删除未使用的 `FileUpload` 与 Vite 默认资产，修复初始 build 错误

## 跳过项

- 设计自检第 5 项的截图存档未完成。原因记录于 [docs/blockers.md](/C:/Exceling/docs/blockers.md:1)：当前终端工具链无法直接截取本地运行 UI 的截图。

## 设计自检

1. `#[0-9a-fA-F]{3,8}` 全局 grep：仅 `src/design/tokens.ts` 命中
2. `box-shadow|drop-shadow|backdrop-filter|linear-gradient|radial-gradient`：0 命中
3. `font-style:\s*italic|\bitalic\b`：0 命中
4. 装饰 emoji grep：0 命中
5. 组件对照 `design.md`：已按代码级对照完成，截图阻塞见 blockers
6. axe-core：未执行，当前会话没有现成的浏览器自动化/页面截图通道可直接跑页面级审计

## 测试结果

- `npm run test`：通过，8 个测试文件 / 18 个测试全部通过
- `npm run lint`：通过，0 error / 0 warning
- `npm run build`：通过

## 备注

- 当前画布以空白编辑态启动，满足 Sprint 1 “从面板拖节点进入画布”的验收路径
- `flowStore` 的旧链式生成卡片测试已替换为当前真相下的 `undo/redo` 编辑测试
