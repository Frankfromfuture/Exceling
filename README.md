# exceling

**中文** · [English](#english)

> 上传任意 Excel 文件，用紫色填充标记起点与终点，自动从杂乱表格中找出计算主脉络并可视化为交互式节点图，说明框同步输出自然语言汇报。

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://typescriptlang.org)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🟣 **紫色填充识别** | 在 Excel 中将起始与终点单元格设为紫色填充，工具自动推断哪个是起点、哪个是终点 |
| 🔗 **计算主脉络** | 从终点出发向上 BFS，找出所有对结果有贡献的计算链，主路径高亮显示 |
| 🎨 **颜色编码运算** | 加(绿) / 减(红) / 乘(蓝) / 除(橙)，运算符节点圆角矩形，常量内嵌显示 |
| 🗂️ **DAG 自动布局** | 基于 Dagre 的左→右有向无环图布局，一键整理按钮随时重排 |
| ▶️ **逐步动画播放** | 按计算拓扑顺序逐步点亮节点，播放时非主路径元素自动淡出 |
| 📝 **自然语言解说** | 说明框生成一段成型的中文汇报语气描述，如"以营业收入扣除成本，毛利润为 400" |
| 🔍 **公式悬停预览** | 鼠标移到卡片上弹出公式提示框，单元格地址自动替换为标签名 |
| ⚙️ **Go 后端加速** | 可选启动 Go 后端（excelize），支持 IF / VLOOKUP / INDEX 等复杂函数 |

---

## 快速开始

### 准备 Excel 文件

1. 打开 Excel，找到你的**起始数据单元格**（纯数值，无公式）和**最终结果单元格**（有公式，处于链路末端）
2. 将这两个单元格的**填充颜色设为紫色**（色相约 265°–320°，如 Excel 内置"紫色" `#7030A0`）
3. 保存为 `.xlsx` 格式

> 也可在上传页面的「起点/终点单元格」输入框中直接填写地址（如 `B2` / `F12`），优先级高于颜色识别。

### 本地运行（前端 + Go 后端）

```bash
git clone https://github.com/Frankfromfuture/Exceling.git
cd Exceling
npm install
npm start          # 同时启动 Go 后端(:8080) 和 Vite 前端(:5173)
```

> **仅前端模式**（不需要 Go 环境）：
> ```bash
> npm run dev
> ```
> 此时自动 fallback 到 SheetJS 解析，支持加减乘除基础运算，复杂函数（IF/VLOOKUP 等）以直连边显示。

打开 `http://localhost:5173`，拖拽上传 `.xlsx` / `.xls` 文件即可。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript + Vite |
| 可视化 | @xyflow/react v12（React Flow）|
| 图布局 | @dagrejs/dagre |
| Excel 解析（前端）| SheetJS (xlsx 0.18.5) + fflate |
| Excel 解析（后端）| Go + excelize v2.8.1 |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS v3 + framer-motion |

---

## 路线图

| 版本 | 状态 | 目标 |
|------|------|------|
| v0.1 | ✅ | 加减乘除基础运算可视化、主路径高亮、动画播放 |
| v0.2 | ✅ | 自然语言解说框、Go 后端支持复杂函数、公式悬停预览 |
| v0.3 | 🔲 | 颜色识别优化、多工作表支持 |
| v0.4 | 🔲 | 可视化编辑节点并导出为 Excel |
| v0.5 | 🔲 | 直接用卡片创建 Excel 表格 |

---

## License

[MIT](LICENSE) © 2025 exceling contributors

---

---

<a name="english"></a>

# exceling — Excel Formula Flow Visualizer

> Upload any Excel file, mark start and end cells with purple fill, and automatically extract the calculation chain as an interactive node graph with natural-language narration.

---

## Features

| Feature | Description |
|---------|-------------|
| 🟣 **Purple Fill Detection** | Mark your source and result cells with purple fill in Excel; the tool infers which is the start (input) and which is the end (output) |
| 🔗 **Main Path Extraction** | Backward BFS from the end node collects every cell that contributes to the final result; highlighted as the main path |
| 🎨 **Color-Coded Operators** | Addition (green) / Subtraction (red) / Multiplication (blue) / Division (orange) in rounded-rectangle operator nodes with inline constants |
| 🗂️ **Auto Layout** | Dagre left-to-right DAG layout with a one-click re-layout button |
| ▶️ **Step Animation** | Lights up nodes in topological order; non-main-path elements fade out during playback |
| 📝 **Natural Language Narration** | Generates a cohesive paragraph in Chinese business-report style describing each calculation step |
| 🔍 **Formula Tooltip** | Hover any cell card to see its formula with cell addresses replaced by readable labels |
| ⚙️ **Go Backend** | Optional Go backend (excelize) enables IF / VLOOKUP / INDEX / MATCH and other complex functions |

---

## Quick Start

### Prepare your Excel file

1. Identify your **source cell** (raw input value, no formula) and **result cell** (formula, end of chain)
2. Set both cells' **fill color to purple** (hue ~265°–320°, e.g. Excel's built-in "Purple" `#7030A0`)
3. Save as `.xlsx`

> Alternatively, type the cell addresses (e.g. `B2` / `F12`) in the Start / End fields on the upload page — these take priority over color detection.

### Run locally (frontend + Go backend)

```bash
git clone https://github.com/Frankfromfuture/Exceling.git
cd Exceling
npm install
npm start          # starts Go backend (:8080) and Vite frontend (:5173) concurrently
```

> **Frontend-only mode** (no Go required):
> ```bash
> npm run dev
> ```
> Falls back to SheetJS parsing. Supports basic arithmetic; complex functions (IF/VLOOKUP etc.) are rendered as direct dependency edges.

Open `http://localhost:5173` and drag-drop your `.xlsx` / `.xls` file.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript + Vite |
| Visualization | @xyflow/react v12 (React Flow) |
| Graph Layout | @dagrejs/dagre |
| Excel Parsing (frontend) | SheetJS (xlsx 0.18.5) + fflate |
| Excel Parsing (backend) | Go + excelize v2.8.1 |
| State | Zustand |
| Styling | Tailwind CSS v3 + framer-motion |

---

## Roadmap

| Version | Status | Goal |
|---------|--------|------|
| v0.1 | ✅ | Basic arithmetic visualization, main-path highlight, step animation |
| v0.2 | ✅ | Natural-language narration, Go backend for complex functions, formula tooltip |
| v0.3 | 🔲 | Improved color detection, multi-sheet support |
| v0.4 | 🔲 | Visual node editing with Excel export |
| v0.5 | 🔲 | Build Excel spreadsheets directly from node cards |

---

## License

[MIT](LICENSE) © 2025 exceling contributors
