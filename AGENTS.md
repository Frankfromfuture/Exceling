# exceling

Excel 公式计算主脉络可视化工具。上传任意 Excel 文件，用紫色填充标记**起点**和**终点**两个单元格，自动从杂乱表格中找出连接它们的计算主脉络，以交互式节点图呈现，并在说明框中用自然语言实时描述计算过程。

---

## 核心交互

1. 上传 `.xlsx` / `.xls` 文件
2. 在 Excel 中将**起始数据**单元格和**终点结果**单元格设为紫色填充（无需其他标记）
3. 工具自动推断哪个是起点、哪个是终点，找出主脉络并高亮显示
4. 非主脉络节点/连线半透明降权显示
5. 说明框按计算顺序累积输出自然语言描述

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript + Vite |
| Excel 解析 | SheetJS (xlsx 0.18.5) + fflate（ZIP 直读 OOXML） |
| 可视化 | @xyflow/react v12（React Flow）|
| 图布局 | @dagrejs/dagre（左→右 DAG 自动排布）|
| 状态 | Zustand |
| 样式 | Tailwind CSS v3 + framer-motion |

---

## 关键文件

```
src/
├── lib/excel/
│   ├── detectPurpleFrame.ts   # 紫色填充检测（detectMarkedCells）+ 颜色解析
│   ├── extractCellData.ts     # 提取单元格值/公式/标签
│   └── parseXlsx.ts           # 主解析入口
├── lib/formula/
│   ├── tokenize.ts            # 公式分词
│   └── buildGraph.ts          # 构建 DAG，推断起点/终点
├── lib/layout/autoLayout.ts   # Dagre 自动布局
├── store/flowStore.ts         # 全局状态 + findMainPath 主脉络 BFS
└── components/
    ├── FlowCanvas/            # 主画布 + PlaybackNarration 说明框
    ├── nodes/CellNode.tsx     # 单元格卡片（主脉外自动降权）
    ├── nodes/OperatorNode.tsx # 运算符节点
    ├── edges/AnimatedEdge.tsx # 动画连线
    └── AnimationBar/          # 播放控制栏
```

---

## 起点/终点推断逻辑

`buildGraph.ts` + `flowStore.findMainPath`：
- **起点** = 紫色填充且无公式（纯数据）的格，或入度为 0 的格
- **终点** = 紫色填充且有公式、出度为 0 的格（链路末端）
- 主脉络 = 从起点到终点的 BFS 最短路径（含途经运算符节点）

---

## 备案库：excelize（Go）

**仓库**：https://github.com/qax-os/excelize  
**语言**：Go（不可直接用于本前端项目）  
**保留原因**：未来若加 Go 后端，可替代 SheetJS 用于：

| 场景 | excelize 优势 |
|---|---|
| 主题色/Tint 解析 | 原生 `GetStyle()` 直接返回结构体，无需手写 XML |
| 公式计算 | `CalcCellValue()` 直接算出结果，SheetJS 不具备 |
| 导出 Excel | `SetCellFormula` + `SetCellStyle` 写回能力强 |
| 大文件 | Streaming API，低内存占用 |

当前 JS 端紫色检测的主题色 Tint 逻辑（`applyTint` in `detectPurpleFrame.ts`）可参照 excelize 源码中 `styles.go` 改进。
