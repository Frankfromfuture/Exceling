# Exceling 产品级优化建议报告

## Context

**项目定位现状**：Exceling 是一个 React 19 + TypeScript + Vite + Go 双端架构的 Excel 公式可视化工具。核心机制是用紫色填充标记起点/终点，自动构建 DAG，多级聚焦显示主脉络。当前版本 v0.0.0，无单元测试，无错误边界。

**优化方向（用户需求）**：底层算法、功能实用性、易用性、指导性 — **不涉及 UI 美化**。

**报告原则**：每条建议包含「问题诊断 → 改进方案 → 优先级 (P0–P2) → 预估工作量」。重点放在**让产品从 demo 走向生产工具**的关键改进。

---

## 一、算法层核心修正（P0）

### 1.1 敏感性算法缺乏经济学/财务意义

**问题诊断**（`src/lib/formula/sensitivity.ts:92-100`）
- 当前用 `|V_i| / sum(|V_i|)` 作为加减权重 — 这是**绝对贡献度**，而非用户真正需要的"弹性"
- 减法 `A - B` 中 B 被给与正权重，但实际 B↑导致结果↓ — **方向反了**
- 乘除直接给 1.0 — 忽略输入间的相互影响
- `sum=0` 时退化为 `1/n` 均分 — 借贷相消的余额表中产生无意义权重

**真实场景痛点**：财务/投资分析师看到的"敏感性"与决策无关，工具变成"看上去很专业的玩具"。

**改进方案**
```typescript
// src/lib/formula/sensitivity.ts 新增「弹性模式」
export function computeElasticity(
  endNodeId: string,
  inputCells: string[],
  perturbation = 0.01,  // ±1%
): Map<string, number> {
  // 对每个输入做 ±1% 扰动，正反双向取均值
  // 返回 (%ΔY/%ΔX) 弹性系数
  return inputCells.reduce((m, id) => {
    const baseline = recompute(graph, id, 0)
    const bumpUp   = recompute(graph, id, +perturbation)
    const bumpDown = recompute(graph, id, -perturbation)
    const elasticity = ((bumpUp - bumpDown) / (2 * perturbation * baseline))
    return m.set(id, elasticity)  // 带正负号
  }, new Map())
}
```
- 配合「敏感性热力图」UI 切换：旧的"贡献度"模式 vs 新的"弹性"模式
- 进阶：龙卷风图（Tornado Chart）按弹性绝对值排序，自然得出 top-N 关键驱动

**优先级 P0｜工作量 2 周**

### 1.2 主路径用「全祖先」替代「关键路径」

**问题诊断**（`src/store/flowStore.ts:findMainPath` + `collectAllAncestors`）
- 当前 `mainPathNodeIds` 是**所有贡献者的并集**，不是真正的"关键路径"
- 当输出有 100 个上游单元格时，"主路径"等于全图，压缩失败
- 即使你最近做了 Level 1 的 top-7 剪枝，下层数据结构仍然是全祖先 → 性能浪费

**改进方案**
- 重定义 `mainPathNodeIds = 敏感性加权关键路径`：用 Dijkstra 在反向图上找"最高累积弹性"路径
- 或者沿用现状但补充 `criticalPathNodeIds`（专为可视化使用），在 store 中并存
- 关键阈值（当前硬编码 7、0.05）改为基于图规模动态计算：`Math.max(5, Math.ceil(log2(N)))`

**优先级 P0｜工作量 1 周**

### 1.3 桥接边语义丢失

**问题诊断**（`src/store/flowStore.ts:computeBridgeEdgesForVisible`）
- 你最新加的 bridge edge 硬编码 `data: { operator: '+' }` — 是**语义谎言**
- 实际跳过的中间链可能是 `×2 → ÷1.5 → −10`

**改进方案**
```typescript
interface BridgedEdgeData {
  operator: 'composite'           // 新增类型
  composedFrom: {
    cellLabels: string[]          // 跳过的节点标签
    operatorChain: Operator[]     // 实际操作符序列
    netEffect?: 'amplify' | 'attenuate' | 'invert'  // 推断的整体效果
  }
}
```
- 渲染时显示「⤳ 跳过 3 步运算」气泡，hover 展开完整链路

**优先级 P1｜工作量 3 天**

### 1.4 折叠规则的语义误判风险

**问题诊断**（`src/lib/formula/buildGraph.ts:collapseArithmeticGroups`）
- 仅按 "操作符 + 常数" 折叠，不看业务语义
- "销售额×1.13"（含税）和 "成本×1.13"（含税）会被合并，但用户希望分别看
- `collapseValueDuplicates` 同理：相同数值不代表同一概念

**改进方案**
- 引入「语义分组键」：除常数外，加入上游标签的语义聚类（编辑距离 < 0.3 才合并）
- 提供用户级别黑名单：`displaySettings.preventCollapse: string[]`（地址列表）
- 折叠节点添加「展开」按钮 — 让用户可以临时还原查看细节

**优先级 P1｜工作量 1 周**

---

## 二、公式解析能力扩展（P0–P1）

### 2.1 条件公式无分支可视化（最痛的一个）

**问题诊断**（`src/lib/formula/buildGraph.ts:447-464`）
- IF / IFS / SWITCH 当前退化为**全依赖直连**
- `=IF(A1>100, B1*0.1, C1*0.05)` 当前显示 A1、B1、C1 都是输入 — 完全丢失"只有一条分支会执行"的关键信息
- 财务模型中分段税率、折扣阶梯等场景 = 完全无法分析

**改进方案**
```typescript
// 新增节点类型：BranchNode
interface BranchNodeData {
  condition: string           // "A1 > 100"
  conditionDeps: string[]     // 条件用到的单元格
  branches: {
    label: string             // "true" / "false" / "case 1"
    targetCellId: string      // 该分支的输出节点
    isActive: boolean         // 当前数据下哪条路径被触发
  }[]
}
```
- 渲染：菱形决策节点 + 分支标记被命中的高亮
- Go 后端：扩展 `parseFormulaIF` 解析 IF 树，提取 condition/then/else
- 当前数据下未触发的分支：半透明显示，但点击可看"反事实"

**优先级 P0｜工作量 3 周**

### 2.2 跨工作表 / 外部链接彻底丢失

**问题诊断**（`src/lib/formula/tokenize.ts:174` 过滤 EXTERNAL_REF）
- 当前完全忽略 `Sheet2!A1` 这种引用
- 实际 80%+ 的真实 Excel 模型是**多 Sheet 的**（损益表 → 现金流 → 估值表）
- 工具实际只能分析"单页表"，竞争力大打折扣

**改进方案**
- **第一阶段**：扫描 workbook 全部 Sheet，构建虚拟跨表节点 `VirtualRefNode`
  - 节点视觉上带 Sheet 名前缀（如 `预算表!B12`）
  - 不解析跨表节点的上游公式（避免组合爆炸），但显示其计算结果
- **第二阶段**：可点击跨表节点 → 切换 Sheet 视图，递归追踪
- **第三阶段**：支持外部工作簿 `[Budget.xlsx]Sheet1!A1` — 引导用户上传补充文件

**优先级 P0｜工作量 4 周（分阶段）**

### 2.3 不支持的现代函数清单

| 函数类别 | 缺失 | 影响 |
|---------|------|------|
| 动态数组 | FILTER, SORT, UNIQUE, SEQUENCE | Office 365 用户无法用 |
| 参数化 | LET, LAMBDA | 现代函数式公式无法解析 |
| 数据库类 | DGET, DSUM, DAVERAGE | 数据库式查询丢失 |
| 数组公式 | `{=SUM(A1:A10*B1:B10)}` | 矩阵运算无法展示 |
| 命名管理 | NamedRange | 业务命名（如"年度收入"）丢失 |

**改进方案**
- 优先扩展 `COMPLEX_FN_RE` 加入这些函数 → 至少能识别为黑盒，不会崩溃
- LET / LAMBDA：解析变量绑定，构建子图
- 命名管理：解析 `workbook.Names`，生成 alias 节点（类似 `valueDuplicateNode`）
- 数组公式：单独标记，UI 显示"⚠ 此公式按数组方式计算"

**优先级 P1｜工作量 2 周（命名管理） + 4 周（其他）**

### 2.4 无循环引用检测

**问题诊断**：`buildFlowGraph` 假设无环，若用户 Excel 含循环（A=B+1, B=A+2），生成畸形图，可能死循环

**改进方案**
```typescript
// src/lib/formula/detectCycles.ts
export function detectCycles(edges: FlowEdge[]): string[][] {
  // Tarjan SCC 算法 - O(V+E)
  // 返回所有环路（每个环是节点列表）
}
```
- UI：环路节点红色边框，连线动画反向流动
- 警告框："检测到循环引用 A→B→C→A，Excel 中需启用迭代计算"

**优先级 P0｜工作量 3 天**

### 2.5 大文件 SUM 展开性能爆炸

**问题诊断**（`src/lib/formula/buildGraph.ts:expandSumFormula`）
- 嵌套 SUM 递归展开，无深度限制
- `=SUM(SUM(SUM(A1:A100)))` 会展开成 100^3 项

**改进方案**
- 加深度上限：`MAX_SUM_EXPANSION_DEPTH = 5`
- 加范围上限：`SUM(A1:A1000)` 直接折叠为 sumClusterNode 而非展开 1000 个引用
- Web Worker 中执行 buildGraph，避免阻塞 UI

**优先级 P0｜工作量 2 天**

---

## 三、互动深度（最致命的产品空白，P0）

### 3.1 What-if 模拟（投资/决策类应用的核心）

**问题诊断**：用户能看图但不能"改一个假设看变化" — 工具退化为查看器
- Excel 自带工具：手动改、手动看 — 慢、无可视化
- Exceling 应该的优势：**改任意输入，立即看到下游所有节点的数值变化、敏感性重排**

**改进方案**
```typescript
// src/lib/whatif/simulate.ts
export interface WhatIfScenario {
  baseline: Map<string, number>      // 原始值
  overrides: Map<string, number>     // 用户修改的值
  recomputed: Map<string, number>    // 模拟结果
  delta: Map<string, { abs: number; pct: number }>  // 变化量
}

// 用户在 CellNode 上拖动滑块或输入 → 调用此函数 → 全图刷新
```
- 实现要点：JS 端实现公式计算引擎（对当前支持的算术 + IF 即可，不必全量）
- 复杂函数场景 → 调 Go 后端 `/api/recalc` 用 excelize.CalcCellValue
- UI（不算 UI 美化）：节点上显示 `1,000 → 1,200 (+20%)` 的对比标记

**优先级 P0｜工作量 4 周**

### 3.2 浏览器内点选起终点

**问题诊断**：`endCellInput` 仅在初始加载时使用，加载后无法改
- 用户标错紫色 → 必须回 Excel 重标 → 重新上传 → 极差的体验

**改进方案**
- CellNode 右键菜单：「设为起点」「设为终点」「在此中断主路径」
- 任意节点 → 调用 `setStartCellInput / setEndCellInput` → 触发 `findMainPath` 重算
- 增加"主路径预览"：hover 任意节点时高亮"如果以此为终点，主路径会变成什么样"

**优先级 P0｜工作量 1 周**

### 3.3 紫色检测失败的可恢复性

**问题诊断**：当前紫色识别失败时用户**完全卡住**，无任何反馈
- Mac 版 Excel、自定义主题、深色模式下紫色值都不同

**改进方案**
- 检测失败时弹出引导：「未识别到紫色单元格，请：① 点击单元格直接选择 ② 输入地址 ③ 上传带紫色样本的截图作为参考色」
- "样本采样"模式：让用户在 UI 中点选一个紫色单元格，作为 ΔE CIE76 色差比对的参考
- Logging：把识别失败的样本（脱敏后）记录，反向优化默认色域

**优先级 P0｜工作量 1 周**

### 3.4 多 Sheet 支持（与 2.2 配套）

**问题诊断**：当前只解析第一个 Sheet
- 真实 Excel 模型必然多 Sheet
- 即使不做跨表追踪，至少应允许用户切换 Sheet 看不同视图

**改进方案**
- 顶部 Sheet Tab 栏：显示所有 Sheet 名称，点击切换
- 每个 Sheet 独立维护一份 `flowStore` state（用 Map 索引）
- 与 2.2 联动：跨表引用节点点击 → 切到目标 Sheet 并高亮

**优先级 P0｜工作量 1 周**

---

## 四、输出与协作（P1）

### 4.1 解说文档导出

**问题诊断**：`PlaybackNarration` 输出的自然语言解说**不能导出**
- 这是工具的核心卖点（"自然语言报告"），但用户最终只能截图/复制
- 直接削弱了产品的"报告生成器"定位

**改进方案**
```typescript
// src/lib/export/narrationDoc.ts
export function exportNarration(
  format: 'markdown' | 'docx' | 'pdf',
  options: {
    includeFlowDiagram: boolean   // 嵌入 SVG 图
    includeSensitivity: boolean   // 包含敏感性表
    includeFormulaTable: boolean  // 包含公式清单
  }
)
```
- Markdown：浏览器原生即可
- DOCX：用 `docx` npm 包
- PDF：`html2pdf.js` 或 Go 后端用 wkhtmltopdf

**优先级 P1｜工作量 1.5 周**

### 4.2 可分享链接（带状态 URL）

**问题诊断**：当前是纯前端，无后端持久化 → 用户每次重新上传

**改进方案**
- 后端 `/api/share` 存储 `parsedCells + 用户配置`，返回短链
- 加密 + 过期时间（默认 7 天，可付费扩展）
- 受访者无需上传 Excel 即可看完整可视化（只读模式）

**优先级 P1｜工作量 2 周（含简单的 Postgres + 短链生成）**

### 4.3 PNG / SVG 图片导出

**问题诊断**：无导出 — React Flow 默认不带，需要手动实现

**改进方案**
- 用 `html-to-image` + `dom-to-svg` 库直接导出当前画布
- 提供"全图" vs "当前焦点" vs "选中节点周围 N 跳" 三种模式

**优先级 P2｜工作量 2 天**

### 4.4 公式风险审计报告

**问题诊断**：工具**只展示**，不**评估** — 缺乏"指导性"
- 真实场景：财务审计、模型治理需要"哪些公式有风险"

**改进方案**
```typescript
interface RiskReport {
  divisionByZero: { cell: string; risk: 'high' | 'medium' }[]
  hardcodedValues: { cell: string; value: number }[]   // 公式中嵌入的魔数
  externalDeps: string[]                                 // 跨表 / 外部链接
  cycles: string[][]                                     // 循环引用
  inconsistentFormulas: { cells: string[]; reason: string }[]  // 同列不一致公式
  unusedInputs: string[]                                 // 输入但未参与计算
}
```
- 检测规则可配置（行业模板）
- 报告嵌入解说文档

**优先级 P1｜工作量 2 周**

---

## 五、AI / LLM 集成（P1，差异化关键）

### 5.1 公式语义解读

**机会**：当前解说是**句法层面**（"加上"/"乘以"），LLM 可做**语义层面**（"利息收入"/"应付税金"）

**实现方案**
```typescript
// src/lib/ai/interpretFormula.ts
async function interpretFormula(req: {
  formula: string
  upstreamLabels: string[]
  downstreamLabels: string[]
  sheetContext: { sheetName: string; nearbyHeaders: string[] }
}): Promise<{
  semanticName: string         // "净利润率"
  businessMeaning: string      // "衡量每元收入产生的净利润"
  unit: string                 // "%"
  riskNotes?: string           // "C5 可能为零，建议加 IFERROR"
}>
```
- 后端 `/api/ai/interpret` 调 Claude API，prompt cache 模板部分
- 用户点击 CellNode → 右侧浮窗显示语义解读
- 月成本估算：$50-200（取决于 DAU）

**优先级 P1｜工作量 3 周**

### 5.2 自动化业务文档生成

**机会**：让 Claude 把整个图谱写成"投资委员会报告"风格的总结

**实现方案**
- 输入：完整 DAG + 所有节点标签 + 关键节点的弹性数值
- 输出：3-5 段执行摘要 + 风险提示 + 关键驱动分析
- Prompt 模板根据用户行业选择（金融/工程/销售/HR）

**优先级 P1｜工作量 1 周**

### 5.3 命名建议

**机会**：很多 Excel 没有标签，C25 不知道是什么 → LLM 可以根据周围上下文（同列 header、同行 label）推断

**实现方案**
- 批量处理：选中 N 个无标签节点 → 一次 API 调用获取建议命名
- 用户可批准/修改 → 写回 `displaySettings.cellAliases`
- 进阶：直接通过 Go 后端写回 Excel 的单元格 Comment

**优先级 P2｜工作量 1 周**

### 5.4 公式 bug 智能检测

**机会**：除以可能为零、公式不一致、单位不匹配 — LLM 比规则引擎在"语义层"更强

**例子**：
- "A1 是金额，B1 是百分比 → A1 + B1 量纲错误"
- "C 列前 10 行用 SUMIF，第 11 行突然用 SUM — 可疑"

**优先级 P1｜工作量 2 周**

---

## 六、工程化与可靠性（P0–P1，债务）

### 6.1 零测试覆盖（紧迫的技术债）

**现状**：`find` 0 个测试文件 — 任何重构都是赌博

**改进方案**
- 引入 Vitest（Vite 原生兼容）
- 最小可行集（20 个测试，覆盖率 60%）：
  - `tokenize.ts` 边界用例（嵌套括号、跨表引用、错误公式）
  - `buildGraph.ts` 折叠规则的"该折叠"和"不该折叠"两类样本
  - `sensitivity.ts` 对比基准期望值
  - `findMainPath` / `computeLevelNodeIds` 在"无紫色/单紫色/多紫色/循环"四种场景
- E2E：Playwright，覆盖"上传 → 渲染 → 焦点切换"主流程
- CI：GitHub Actions `npm test && npm run build`

**优先级 P0｜工作量 1 周（最小集）+ 2 周（持续覆盖）**

### 6.2 无 ErrorBoundary / 崩溃恢复

**现状**：`buildFlowGraph` 报错 → 整个 store 卡住，UI 白屏

**改进方案**
- `src/components/ErrorBoundary.tsx` 包裹 `<App>` 和 `<FlowCanvas>`
- 错误信息脱敏后通过可选 telemetry 上报
- 提供「降级模式」：解析失败时仅显示原始 Excel 表格

**优先级 P0｜工作量 2 天**

### 6.3 Store 拆分（700+ 行单文件）

**现状**：`flowStore.ts` 已超 700 行，混合了状态、路径算法、动画控制

**改进方案**
```
src/store/
├── flowStore.ts          (主入口 + 文件状态)
├── focusStore.ts         (focus mode + level 计算)
├── animationStore.ts     (动画播放)
└── pathStore.ts          (findMainPath + bridge edges + 敏感性)
```
- 用 Zustand 的 slice 模式，subscribe 共享必要字段
- 收益：Code review 友好、单测可独立、未来加 What-if store 更容易

**优先级 P1｜工作量 1 周**

### 6.4 性能监控

**问题**：当前对大表性能上限完全未知（猜测 500-1000 节点）

**改进方案**
- 加 `web-vitals` + 自定义 metrics：
  - `parseTime`: Excel → ParsedCell 的耗时
  - `buildGraphTime`: ParsedCell → DAG
  - `layoutTime`: Dagre 布局
  - `renderTime`: 首次渲染到可交互
- 大文件提示：节点数 > 500 时自动启用 Web Worker + Level 1 默认开启
- 数据收集：localStorage 累积，可选上报

**优先级 P1｜工作量 1 周**

---

## 七、行业模板与生态拓展（P2，长期价值）

### 7.1 行业模板识别与定制规则

**机会**：财务模型 / 工程估算 / 销售漏斗的检测重点完全不同

**实现方案**
- 启发式分类器：基于函数使用模式 + 列名特征 + 公式结构
  - 财务：SUMIF + 日期列 + 利率字眼
  - 工程：物理单位（m, kg） + ROUND 频繁
  - 销售：VLOOKUP 深嵌套 + 百分比列
- 识别后启用对应规则集（如财务表自动开启"四则运算守恒检查"）

**优先级 P2｜工作量 3 周**

### 7.2 Excel Add-in（最大商业杠杆）

**机会**：直接在 Excel 内运行 → 零迁移成本

**实现方案**
- Office.js + manifest.xml + taskpane
- 80% 的现有代码可复用
- 发布到 AppSource → 微软商城信誉 + 用户导流
- **商业模式**：Freemium，$3-10/seat/month

**优先级 P2｜工作量 6 周（含发布）｜ROI ★★★★★**

### 7.3 CLI 治理工具

**机会**：企业 Excel 模型治理 / CI 检查

**实现方案**
```bash
exceling-cli check spreadsheet.xlsx \
  --rules compliance.json \
  --output report.json \
  --fail-on-risk high
```
- 复用现有解析 + 审计规则（4.4）
- 输出 JUnit XML 兼容格式 → 集成 Jenkins/GitHub Actions
- **商业模式**：B2B，按企业年付 $500-5000

**优先级 P2｜工作量 3 周**

### 7.4 VS Code 扩展

**机会**：工程师常常需要看 .xlsx 配置/数据文件

**实现方案**
- 注册 `.xlsx` 文件 Custom Editor
- WebView 加载 React 应用
- 发布到 VS Code Marketplace（免费导流）

**优先级 P2｜工作量 2 周**

---

## 八、优先级路线图（推荐执行顺序）

### Sprint 1-2（4 周）— 修补致命漏洞
- ✅ 6.2 ErrorBoundary（2 天）
- ✅ 2.4 循环引用检测（3 天）
- ✅ 2.5 SUM 展开限制（2 天）
- ✅ 1.1 弹性敏感性（2 周）
- ✅ 1.2 关键路径重定义（1 周）
- ✅ 6.1 最小测试集（1 周）

### Sprint 3-5（6 周）— 实用性突破
- ✅ 3.1 What-if 模拟（4 周）
- ✅ 3.2 浏览器点选起终点（1 周）
- ✅ 3.3 紫色检测可恢复（1 周）
- ✅ 3.4 多 Sheet 支持（1 周，与 2.2 联动）

### Sprint 6-8（6 周）— 解析能力 + AI
- ✅ 2.1 IF 分支可视化（3 周）
- ✅ 2.2 跨表引用第一阶段（2 周）
- ✅ 5.1 LLM 公式语义（3 周，并行）

### Sprint 9-10（4 周）— 输出与生态
- ✅ 4.1 解说文档导出（1.5 周）
- ✅ 4.4 风险审计报告（2 周）
- ✅ 4.2 可分享链接（2 周）

### Sprint 11+ — 商业化
- ✅ 7.2 Excel Add-in（6 周）
- ✅ 7.3 CLI 工具（3 周）

---

## 九、关键文件改动索引

| 改动主题 | 主要文件 |
|---------|---------|
| 弹性敏感性 | `src/lib/formula/sensitivity.ts` |
| 关键路径 | `src/store/flowStore.ts:findMainPath` |
| 桥接边语义 | `src/store/flowStore.ts:computeBridgeEdgesForVisible` |
| IF 分支节点 | `src/lib/formula/buildGraph.ts:447-464`，新增 `BranchNode.tsx` |
| 跨表支持 | `src/lib/excel/parseXlsx.ts`，`src/lib/formula/tokenize.ts:174` |
| 循环检测 | 新增 `src/lib/formula/detectCycles.ts` |
| What-if | 新增 `src/lib/whatif/`，`src/components/nodes/CellNode.tsx` |
| 点选起终点 | `src/components/nodes/CellNode.tsx`，`src/store/flowStore.ts` |
| Store 拆分 | 拆 `src/store/flowStore.ts` → 4 个 store |
| 测试 | 新增 `vitest.config.ts`，`src/**/*.test.ts` |
| AI 集成 | 新增 `src/lib/ai/`，后端 `backend/ai_handler.go` |

---

## 十、验证方法

### 算法层验证
```bash
npm test src/lib/formula/sensitivity.test.ts  # 弹性数学正确
npm test src/lib/formula/detectCycles.test.ts # Tarjan SCC 算法
npm test src/store/flowStore.test.ts          # 路径算法
```

### 端到端验证
1. **小型样本**：5×5 简单表 + 紫色起终点 → 全流程通过
2. **真实财务模型**：10 个 Sheet 的损益现金流估值表（行业典型样本）→ 跨表追踪 + What-if 修改 → 全图实时刷新
3. **病态样本**：含循环引用 / 100 项 SUM / 5 层嵌套 IF → 不崩溃，给出明确提示
4. **大文件**：1000 单元格的工程估算表 → 加载 < 5 秒，焦点切换 < 1 秒

### 性能基准
- 用 web-vitals 在 CI 中跑 baseline 表，超过阈值则失败
- 节点数与各阶段耗时的回归曲线（每次发版前）

---

## 十一、最重要的 3 个建议（如果只能做三件事）

1. **弹性敏感性 + 关键路径重定义**（1.1 + 1.2）— 让"敏感性"有真实价值，让"主路径"真的是主路径
2. **What-if 模拟**（3.1）— 把工具从查看器升级为决策支持系统，差异化最大化
3. **IF 分支可视化 + 跨表引用**（2.1 + 2.2）— 让工具能处理真实 Excel 模型，而不是只能看 demo

这三件事完成后，Exceling 才真正具备"产品级"竞争力。
