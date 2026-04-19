# Exceling Design Spec

> 设计原则：克制、精确、冷静、低饱和、数据优先。  
> 用 sketch 画布直接画业务计算模型，系统理解并生成带公式的 Excel。  
> 从画布（sketch 模式）直接启动，无需先导入 Excel。

---

## §0 核心产品形态

**双模式**：

- `scenario`（默认）：内置 3 个示例模型，立即可用，节点值可直接在画布上双击编辑
- `excel`：导入 `.xlsx` 文件后切换，解析公式链，同样以统一画布展示

无论哪种模式，界面结构完全相同：左侧 Node Library → 中央 Top Bar + Formula Bar + Canvas/Excel → 右侧 Inspector。

---

## §1 颜色系统

### §1.1 中性色（Ink Scale）

| Token      | Hex       | 用途                       |
|------------|-----------|--------------------------|
| `ink-0`    | `#FFFFFF` | 卡片底色、白色文字反色          |
| `ink-50`   | `#FAFAFA` | 侧边栏、工具栏底色             |
| `ink-100`  | `#F4F4F5` | 表头背景、hover 背景           |
| `ink-200`  | `#E4E4E7` | 分割线、边框                  |
| `ink-300`  | `#D4D4D8` | placeholder 色             |
| `ink-400`  | `#A1A1AA` | 次要信息（地址、单位、辅助文字）    |
| `ink-500`  | `#71717A` | 中等强调（角色标签、提示）         |
| `ink-600`  | `#52525B` | 按钮禁用态文字                 |
| `ink-700`  | `#3F3F46` | 节点描边 default（hover 前）    |
| `ink-800`  | `#27272A` | 节点标题、正文                 |
| `ink-900`  | `#18181B` | 强调文字、选中描边、按钮主色       |
| `ink-1000` | `#0A0A0A` | 最高强度（边 chip 背景、输出数值）  |

### §1.2 功能色（Accent）

4 色全部低饱和（HSL 饱和度 ≤ 25%）：

| Token           | Hex       | 语义         | 边类型    |
|-----------------|-----------|------------|---------|
| `accent-sage`   | `#8CA291` | 输入 / 加法  | `+` 边  |
| `accent-mauve`  | `#BB8F96` | 输出 / 减法  | `−` 边  |
| `accent-slate`  | `#8195A6` | 计算 / 乘法  | 乘法修饰  |
| `accent-sand`   | `#AE9F7E` | 常量 / 除法  | —      |

### §1.3 状态色

| Token        | Hex       |
|--------------|-----------|
| `status-ok`  | `#6B8E6B` |
| `status-warn`| `#B89968` |
| `status-err` | `#A85856` |
| `status-info`| `#6B8195` |

---

## §2 字体系统

### §2.1 字体栈

```
sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif
mono: "JetBrains Mono", "Geist Mono", "SF Mono", Consolas, monospace
```

**JetBrains Mono 是 mono 的首选**，通过 Google Fonts 引入：

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&...');
```

### §2.2 使用规则

| 场景                    | 字体  | 字号  | 字重  |
|------------------------|-------|------|------|
| 节点数值（最强视觉元素）  | mono  | 18px | 700  |
| 公式栏结果值             | mono  | 28px | 700  |
| Inspector 数值盒        | mono  | 24px | 700  |
| 节点标题                | sans  | 12px | 600  |
| 角色标签（INPUT 等）    | sans  | 9px  | 600  |
| 单元格地址               | mono  | 9px  | 400  |
| 边 chip 文字            | mono  | 11px | 600  |
| 边 chip 说明            | sans  | 8px  | 400  |
| 公式栏原始公式           | mono  | 13px | 400  |
| 侧边栏分组标签           | sans  | 10px | 600，大写，letter-spacing 0.08em |

---

## §3 节点卡片（Node Card）

### §3.1 尺寸

- 默认宽：`168px`，高：`82px`，圆角：`rx="6"`（SVG rect）
- 无 CSS box-shadow，用 `filter="url(#rough-u)"` 做手绘质感

### §3.2 结构（从上到下）

```
┌──────────────────────────────────┐  ← rx=6，stroke ink-700 1.1px
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ← 语义色条 22×3px，贴顶贴左
│ INPUT  ·  B2               B2   ← 角色 9px sans + 地址 9px mono，y=19
│ Units Sold                       ← 标题 12px sans 600，y=38
│                                  │
│ 2,400                            ← 数值 18px mono 700，y=h-14
└──────────────────────────────────┘
```

### §3.3 交互状态

| 状态     | border            | fill    |
|---------|-------------------|---------|
| default | ink-700，1.1px    | ink-0   |
| hover   | ink-400，1.1px    | ink-0   |
| selected| ink-900，1.6px    | ink-50  |
| dimmed  | —（opacity 0.28） | —       |

### §3.4 语义色条颜色

| 节点类型   | 色条颜色        |
|----------|---------------|
| input    | accent-sage   |
| computed | accent-slate  |
| output   | accent-mauve  |
| const    | accent-sand   |

### §3.5 端口（Port）

节点 hover / selected 时四个方向出现端口：

- 外圆：r=6，fill ink-0，stroke ink-900 1.2px
- 内点：r=2.5，fill ink-900
- 点击端口 → 打开 Radial Operator Picker

### §3.6 内联编辑（Double-click）

input 种类的节点双击数值 → `<foreignObject>` 出现 HTML `<input type="number">`：

- border ink-900 1px，fill ink-50，outline none
- Enter 提交，Esc 取消，blur 自动提交
- 提交后 scenario 模式写入 overrides，excel 模式写入 store

---

## §4 边（Edge）

### §4.1 路径

Wobbly cubic bezier（模拟手绘弯曲感）：

```
M sx sy C mx (sy+wob), mx (ty-wob), tx ty
```

其中：
- `sx = source.x + source.w`，`sy = source.y + source.h/2`
- `tx = target.x`，`ty = target.y + target.h/2`
- `mx = (sx + tx) / 2`
- `wob = sin((sx + sy) * 0.013) * 4`

### §4.2 颜色与线型

| op  | stroke 色      | 线宽  | dasharray |
|-----|---------------|------|-----------|
| `+` | accent-sage   | 1.35px | — (实线) |
| `−` | accent-mauve  | 1.35px | `5 3`    |
| 带乘法修饰 | — | 1.75px | — |

### §4.3 箭头 marker

每种颜色一个独立 marker，内联到 SVG `<defs>`：

```svg
<marker id="arrow-sage"  …><path d="M 0 0 L 10 5 L 0 10 Z" fill="#8CA291"/></marker>
<marker id="arrow-mauve" …><path d="M 0 0 L 10 5 L 0 10 Z" fill="#BB8F96"/></marker>
<marker id="arrow-slate" …><path d="M 0 0 L 10 5 L 0 10 Z" fill="#8195A6"/></marker>
```

markerWidth/Height = 7，refX = 9，orient = auto-start-reverse。

### §4.4 边 Chip（中点标签）

- 背景：ink-1000，opacity 0.94，rx=4
- 宽度：`max(32, text.length * 7 + 14)px`
- 主文字：11px mono 600，ink-0，居中
- 副文字（常量说明）：8px sans，ink-400
- 仅在 edge **未** hover 时显示；hover 时隐藏，改为显示端点 dot 和中点 `+` puck

### §4.5 边 hover 状态

- 中点出现黑色 puck（r=12，ink-1000），内含 `+` 十字（ink-0，1.6px）
- 端点各显示 r=3.5 dot（fill ink-0，stroke ink-700）
- 点击中点 → 打开 Radial Operator Picker

### §4.6 常量折叠（Const Collapsing）

Scenario 模式中，`const` 种类节点不渲染为卡片，而是被折叠为目标边的 `modifiers`：

- 单纯乘/除常量 → chip 显示 `× 0.42`，副文字显示节点 label（如 `COGS Rate`）
- `(1 − const)` 模式 → chip 显示 `× (1 − 0.23)`，副文字显示 `Tax Rate`

---

## §5 手绘滤镜（Rough Filter）

SVG filter，应用在节点 rect、边 path、语义色条上：

```svg
<filter id="rough-u" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

背景网格（点格）：

```svg
<pattern id="exceling-dots" width="18" height="18" patternUnits="userSpaceOnUse">
  <circle cx="1.5" cy="1.5" r="0.8" fill="#E4E4E7"/>
</pattern>
```

---

## §6 Radial Operator Picker

半圆形扇形运算选择器，支持 9 种运算：

```
+ − × ÷ % xⁿ ▼(min) ▲(max) ≈(round)
```

### §6.1 动画

- 锚点（中心 puck）立即出现：ink-1000 圆形，内含 `+` 图标
- `+` 图标在 mounted 后旋转 45° → `×`（escape 关闭提示）
- 各运算按钮：从锚点位置飞出到各自位置
  - 弹簧曲线：`cubic-bezier(.2,.9,.25,1.2)`
  - 时长：280ms，stagger 每个按钮 delay 28ms
  - opacity 0 → 1，180ms

### §6.2 按钮样式

- 36×36px 圆形
- border ink-900 1px，fill ink-0，color ink-900
- font-family mono，字号 11–15px（glyph 长度决定）

### §6.3 展开半径

`radius = 80px`，span = `Math.PI`（从 `angle - π/2` 到 `angle + π/2`）

---

## §7 布局（Layout）

### §7.1 Scenario 模式（Sketch Layout）

使用 `scenarioLayout()` 函数：

- 拓扑排序按 depth 分列（Dagre-style，纯 JS 实现）
- 每列内节点垂直居中排列
- 各节点加 `stableHash` 微抖动（±4px），避免网格感
- gapX = 96px，gapY = 40px，nodeW = 168px，nodeH = 82px

### §7.2 Excel 模式（Unified Layout）

`layoutUnifiedGraph()` 函数：

- 与 scenario 同算法
- 支持手动拖拽：`onMouseDown` 记录 dragOffset，`onMouseMove` 更新 `manualPositions`
- `manualPositions` 覆盖 `baseLayout.positions`

---

## §8 界面结构

### §8.1 Top Bar（高度 56px，ink-0，borderBottom ink-200）

从左到右：

1. **LogoMark**（20×20 SVG，2×2 格子，2 实 2 空）+ `Exceling`（14px sans 700）+ mono 副标题
2. 分割线（1px ink-200，高 20px）
3. **Scenario 模式**：`<select>` 下拉（scenario 标题）+ subtitle 文字 + Reset overrides 按钮（有 override 时显示）
   **Excel 模式**：文件名
4. `flex: 1` 占位符
5. **Canvas / Excel** 视图切换（pill 形）
6. **Import .xlsx** 按钮（outline，ink-900）
7. **Export .xlsx** 按钮（filled，ink-900 bg，ink-0 text）

### §8.2 Formula Bar（高度自适应，ink-50，borderBottom ink-200）

仅在 Canvas 视图显示，三栏 flex layout：

| 区域   | 内容                              | 样式                          |
|--------|----------------------------------|-------------------------------|
| 左 200px | 角色+地址（10px sans uppercase）+ 标签（14px sans 600） | — |
| 中 flex | 原始公式（13px mono ink-700）+ 代入公式（13px mono ink-500） | — |
| 右     | `result` label（10px） + `= 值`（28px mono 700 ink-1000） | text-align right |

### §8.3 左侧 Node Library（宽 200px，ink-0）

上半：4 种节点类型 card（拖拽源，暂为静态展示）  
下半：当前模型节点列表（点击聚焦）：
- borderLeft 3px + kindColor
- 节点名（12px sans 500）+ 地址（10px mono ink-400）
- 当前值（11px mono ink-500）

### §8.4 中央 Canvas

- 背景：ink-0（overflow: auto）
- SVG 充满，包含：点格、rough filter defs、边、节点
- 左上角 Canvas 状态标签（节点数 · 边数）
- 左下角 Narration bubble（ink-1000 bg，ink-0 text，borderRadius 8px）

### §8.5 右侧 Inspector（宽 280px，ink-0）

- 顶部：节点地址 + 标题
- 数值盒：24px mono 700，ink-50 背景
- 公式区：原始 + 代入
- What-if 滑杆区（每个 input/const 节点一个）：
  - `<input type="range">`，accentColor ink-900
  - delta% 显示（status-ok 绿 / status-err 红）
- 底部（excel 模式）：Undo / Redo / ← Scenarios

---

## §9 内置 Scenario 模型

### revenue（收入利润模型）

`units × price → revenue → (revenue − cogs) → gross → (gross − opex) → operating → operating × (1 − tax_rate) → net`

共 10 个节点，3 个 const 节点（cogs_rate、tax_rate 通过折叠显示在边上）

### saas（SaaS MRR 漏斗）

`leads → mqls → sqls → deals × acv → mrr`

共 9 个节点，3 个 const（mql_rate、sql_rate、close_rate 折叠）

### engineering（工程估算）

`(qty × mat_price) + (hours × rate) → (material + labor) × overhead → total`

共 8 个节点，1 个 const（overhead 折叠）

---

## §10 计算引擎

### §10.1 Scenario 模式

`computeAll(nodes, overrides)` in `src/lib/scenarios/model.ts`：

- 拓扑排序，用 `new Function()` eval 公式
- `overrides` 覆盖 input/const 节点的默认值
- 返回 `Record<nodeId, number>`

### §10.2 数值格式化（`fmt()` 函数）

| 数值范围         | 格式           |
|-----------------|----------------|
| ≥ 1,000,000     | `x.xxM`        |
| ≥ 10,000        | `xx,xxx`       |
| ≥ 100           | `xx,xxx`       |
| 0 < x < 1       | `0.xxx`（3位）  |
| 其他            | 去尾零的 2 位小数 |
| null/NaN/±Inf   | `—`            |

---

## §11 数据流

```
Excel 上传 → parseXlsx.ts → ParsedCell[]
  → buildGraph.ts → FlowNode[] + FlowEdge[]
    → applyDagreLayout → 坐标
      → flowStore (nodes/edges/parsedCells/fileName)
        → buildUnifiedGraph → VisualNode[] + VisualEdge[]
          → UnifiedCanvasPanel (SVG rendering)

Scenario 模式:
SCENARIOS[key].nodes
  → buildScenarioUnifiedGraph → VisualNode[] + VisualEdge[]
    → scenarioLayout → positions
      → UnifiedCanvasPanel (SVG rendering)
  → computeAll(nodes, overrides) → scenarioValues
```

---

## §12 反模式（禁止）

以下任何一项出现即为违规：

- 渐变（`linear-gradient`、`radial-gradient`）
- 光晕 / 毛玻璃（`box-shadow`、`drop-shadow`、`backdrop-filter`）
- 装饰性 emoji（UI 中非 lucide-react 的 emoji 符号）
- 斜体（`font-style: italic`）
- 彩虹色 / 高饱和配色
- 硬编码颜色（#hex / rgb() / hsl() 出现在 tokens.ts 之外）
- 圆角 > 8px（节点 rx=6，容器 border-radius 最大 8px）
- 动画时长 > 300ms（Radial Picker 280ms 已是上限）

---

## §13 文件结构

```
src/
├── components/FlowCanvas/
│   └── FlowCanvas.tsx          # 全量实现（~1940 行，自包含）
├── design/
│   ├── tokens.ts               # ink / accent / status / focus / type / space
│   └── index.ts                # re-export
├── lib/
│   ├── excel/parseXlsx.ts      # Excel 导入（SheetJS + Go fallback）
│   ├── export/exportExcel.ts   # 导出 Excel
│   ├── formula/buildGraph.ts   # 公式图构建
│   ├── scenarios/model.ts      # 内置 3 个 scenario + computeAll + fmt
│   └── whatif/simulate.ts      # what-if 试算
├── store/flowStore.ts           # Excel 模式全局状态 + undo/redo
└── types/index.ts               # FlowNode / FlowEdge / ParsedCell / Operator
```

---

## §14 当前版本已实现能力

- ✅ 直接进入画布（scenario 模式，无需上传）
- ✅ 3 个内置 scenario（revenue / saas / engineering）
- ✅ 节点双击内联编辑数值
- ✅ What-if 滑杆实时更新全部下游
- ✅ 常量折叠进边 chip
- ✅ Wobbly bezier 手绘风格边
- ✅ SVG rough filter（节点 + 边）
- ✅ 每种 op 独立颜色 arrow marker
- ✅ 9 种 Radial Operator Picker（仅 excel 模式可创建新节点）
- ✅ Canvas / Excel 视图切换
- ✅ Excel 上传 → 公式图重建
- ✅ 主脉络聚焦 + 非主脉络 dimming
- ✅ Inspector 公式 + 代入展示
- ✅ Undo / Redo（excel 模式）
- ✅ Export .xlsx
- ✅ JetBrains Mono 字体
- ✅ 点格背景（dot grid 18×18，r=0.8）
