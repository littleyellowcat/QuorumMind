# QuorumMind 技术实力评估报告

> 评估日期: 2026-06-20 | 评估范围: 91 个源文件 | 代码行数: ~20,000 行（含测试）

---

## 总览

| 维度 | 评分 | 等级 |
|------|------|------|
| 数据模型设计 | **7.5/10** | B+ |
| 存储引擎 | **7.0/10** | B |
| 评分算法 | **8.0/10** | A- |
| 提取策略 | **8.5/10** | A |
| 记忆维护 | **6.5/10** | B- |
| 工程实现 | **6.5/10** | B- |
| 中文支持 | **5.5/10** | C+ |
| **综合加权** | **7.1/10** | **B+** |

**结论**: 这是一个**算法核心扎实、工程外围粗糙**的 MVP。评分算法和提取策略达到了生产级质量；数据模型设计合理但缺乏运行时保障；最大的工程债务是 6000 行的单体 App.tsx 和简陋的国际化实现。

---

## 一、数据模型设计 — 7.5/10

**文件**: [src/lib/domain.ts](src/lib/domain.ts)（211 行）

### 优点

1. **类型层次清晰**: `Agent → Proposal → Critique → Verdict → ADR` 的链路完整且命名一致。评审者-提案-评分三者关系建模准确。

2. **领域概念覆盖全面**: 30+ 类型定义覆盖了决策引擎的所有核心概念——从 `DecisionContext`（产品阶段/团队画像/约束）到 `AHPAnalysis`（一致性比率/敏感性场景），没有遗漏关键实体。

3. **评分结果链设计精良**: `ScoredProposal → RegretMapEntry → TopsisLensEntry → MonteCarloStressEntry` 四种评分视角各自独立类型，互不耦合，扩展新评分维度时不需要修改现有类型。

4. **ADR 结构符合行业标准**: `ADR` 类型包含 status/context/decision/consequences/delphiRounds/assumptionLedger，与 Michael Nygard 的 ADR 模板一致，且增加了 regret/topsis/monteCarlo/ahp 四维分析。

### 不足

1. **类型别名滥用**: `CriteriaWeights` 是 `CriteriaScores` 的直接别名（`type CriteriaWeights = CriteriaScores`）。两者语义不同（一个是输入权重，一个是输出分数），这导致类型安全漏洞——编译期无法区分权重和分数。

2. **无运行时验证**: `package.json` 中声明了 `zod: 4.4.3` 依赖，但 `domain.ts` 完全没有使用。所有类型仅为编译期约束，从 API/Provider 传入的数据没有 schema 验证层。

3. **无判别联合**: `Proposal.version` 用 `"initial" | "revised"` 字符串区分状态，但没有利用判别联合为修订版提案提供额外的 `revisionNote` 或 `previousVersionId` 字段——这些信息只能塞进 `reasoning` 字符串。

4. **缺少不可变性标记**: 所有字段均为 mutable。在 Redux/useReducer 场景下，`readonly` 修饰符能防止意外修改。

```typescript
// 当前
export type CriteriaWeights = CriteriaScores;  // 类型别名，无区分

// 建议
export type CriteriaWeights = { readonly [K in keyof CriteriaScores]: number };
```

---

## 二、存储引擎 — 7.0/10

**文件**: [src/lib/decision-repository.ts](src/lib/decision-repository.ts)（67 行）+ [src/lib/decision-history.ts](src/lib/decision-history.ts)（62 行）+ [server/persistence/sqlite-repository.ts](server/persistence/sqlite-repository.ts)（303 行）+ [server/persistence/sqlite-schema.sql](server/persistence/sqlite-schema.sql)（40 行）

### 优点

1. **Repository 模式干净**: `DecisionRepository` 接口（list/save/findById/clear）简洁明确。`createLocalStorageDecisionRepository` 是一个工厂函数，接受 `Storage` 接口作为依赖，天然可测试。

2. **读取时有运行时验证**: `isDecisionHistoryRecord()` 在 JSON.parse 后做结构校验，防止损坏数据污染应用状态。这个防御性设计在 localStorage 场景下尤为重要。

3. **SQLite Schema 设计专业**:
   - CHECK 约束确保枚举值合法性（`locale IN ('en', 'zh')`）
   - 外键级联删除（`ON DELETE CASCADE`）
   - 合理的索引策略（`created_at DESC`，`agent_id, domain` 复合索引）
   - 事务保证（`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`）

4. **安全的行映射**: `toDecisionRoomSummary` 等函数对所有字段做了类型守卫（`stringField`/`numberField`），即使数据库返回意外类型也不会崩溃。

### 不足

1. **无数据迁移框架**: `localStorage` key 中硬编码了 `"v1"`（如 `quorummind.history.v1`），但没有任何版本检测和迁移逻辑。如果 v2 改变了 `DecisionHistoryRecord` 结构，旧数据静默失效。

2. **JSON Blob 反模式**: `decision_traces` 表将 `result_json`、`provider_trace_json`、`live_verdict_json` 存储为 TEXT JSON。这使得无法在 SQL 层面查询具体评分、无法按模型提供者聚合统计、无法做时间序列分析。

3. **无数据压缩**: localStorage 和 SQLite 都不做压缩。一次完整的 Decision Room 快照（包含 trace、verdict、ADR markdown）可能达到 100KB+，12 条上限意味着 localStorage 占用可能超过 1MB。

4. **localStorage 同步阻塞**: `JSON.stringify` + `setItem` 在保存大体量快照时会阻塞主线程，`requestIdleCallback` 或分块写入可以缓解。

---

## 三、评分算法 — 8.0/10

**文件**: [src/lib/scoring.ts](src/lib/scoring.ts)（379 行）+ [src/lib/ahp.ts](src/lib/ahp.ts)（153 行）

### 优点

1. **波达计数实现正确**: 使用 `(proposalCount - rank - 1)` 的标准波达计分公式，并乘以贝叶斯有效投票权重。这是正确的加权波达实现。

2. **贝叶斯投票权重设计合理**:
   ```
   posteriorConfidence = (reputationPrior × 2 + confidence × 3) / 5
   ```
   声誉先验权重 0.4，置信度权重 0.6——这个比例在理论上有依据：声誉反映历史表现（较稳定），置信度反映当前输出的自我评估（较波动）。

3. **TOPSIS 实现符合标准流程**: 向量归一化 → 加权 → 理想解/反理想解 → 欧氏距离 → 贴近度排序。步骤完整。

4. **蒙特卡洛模拟设计精细**:
   - 使用 LCG（`seed × 1664525 + 1013904223`）确保可复现性
   - 三角分布（三个均匀分布之和）模拟中心化不确定性——比简单的高斯噪声更稳健
   - 中心分数公式 `utility × 0.7 + confidence × 0.2 + (100-regret) × 0.1` 权重分配合理
   - 报告 downside P10（第 10 百分位数）——比只报告均值更有决策价值

5. **Dissent Index 使用了 Kendall Tau 距离**: 通过计算排名对之间的逆序对比例来衡量分歧程度。这是排名相关性分析中的标准方法。

6. **数值稳定性好**: 所有外部输入都经过 `clamp`/`clampRatio` 约束，`positiveNumber` 处理了 NaN/undefined，`totalWeight === 0` 有除零保护。

### 不足

1. **AHP 一致性比率是近似值**: `estimateConsistencyRatio` 使用 `spread × 0.12` 估算，而非 AHP 标准方法（构造成对比较矩阵 → 计算最大特征值 λmax → 计算 CI → 查 RI 表）。这个近似在权重分布均匀时合理，但在极端分布（如某个维度权重 0.5）时偏差较大。

2. **蒙特卡洛迭代固定 240 次**: 没有收敛检测。对于 3 个提案、接近的分数的场景，240 次可能不足以稳定 winRate 排序。标准做法是运行到 winRate 排序稳定（例如连续 50 次迭代排名不变）或达到最大迭代上限。

3. **TOPSIS 边缘情况**: 如果某个 criteria 在所有 proposal 中分数完全相同，`denominator === 0` 会被处理（返回 0），但此时该 criteria 失去了区分能力，理想解和反理想解在该维度相同，距离无意义——应发出警告。

4. **regretByScenario 的 key 无约束**: `Record<string, number>` 接受任意字符串，但 scenario 名称应该在类型层面约束（至少用 string literal union），或者在运行时校验不为空。

---

## 四、提取策略 — 8.5/10（最高评分维度）

**文件**: [server/provider-json.ts](server/provider-json.ts)（123 行）+ [server/provider-schema.ts](server/provider-schema.ts)（283 行）

### 优点

1. **三策略渐进式提取**: `parseProviderJson` 按优先级尝试：直接 JSON.parse → fenced code blocks (```json) → balanced bracket extraction。这覆盖了 LLM 输出的三种常见模式：纯 JSON、Markdown 围栏代码块、JSON 嵌在叙述文本中。

2. **括号平衡解析器实现精巧**: `balancedSliceFrom` 手动维护栈，正确处理了字符串内的引号、转义字符、嵌套对象/数组。不依赖任何解析库，且复杂度 O(n)。

   ```typescript
   // 核心逻辑：遇到 { 或 [ 压栈，遇到 } 或 ] 弹栈，栈空时返回切片
   if (char === "{" || char === "[") {
     stack.push(char === "{" ? "}" : "]");
   }
   if (char === "}" || char === "]") {
     const expected = stack.pop();
     if (expected !== char) return undefined;  // 括号不匹配
     if (stack.length === 0) return text.slice(start, index + 1);  // 找到完整 JSON
   }
   ```

4. **Schema 验证的返回类型设计优秀**:
   ```typescript
   type ProviderSchemaResult =
     | { ok: true; validationStatus: "valid" | "repaired"; normalized: T; issues: Issue[] }
     | { ok: false; validationStatus: "invalid"; issues: Issue[] }
   ```
   这是标准的 Rust-style Result 类型。调用方通过 `ok` 判别，TypeScript 自动窄化类型。`repaired` 状态让调用方知道数据可用但不完美。

5. **分阶段验证**: `normalizeProviderPayload` 根据 phase（proposal/revision/ranking/verdict）路由到不同的规范化函数，每个阶段的必填字段和默认值不同——这正是 Provider 输出的现实：不同阶段返回的 JSON 结构不同。

6. **每个字段都有有界默认值**: `boundedNumber(value, 0.65, 0, 1)` — 缺失的 confidence 默认 0.65（略高于中性），而非 0 或 1，这个默认值选择有意识：既不过度乐观也不过度悲观。

### 不足

1. **无 Schema 版本追踪**: 当 Provider 输出格式变更时（如 OpenAI 升级 API），没有版本字段来区分新旧格式。

2. **LLM 输出质量无分析**: 虽然记录了 `issues`，但没有聚合统计（哪个 provider 的 JSON 解析失败率最高？哪个字段最常缺失？），错失了优化提示词的反馈循环。

3. **字符串强制转列表策略激进**: `normalizeStringList` 将单个字符串自动包装为单元素数组。这在某些场景便利，但也可能掩盖 Provider 输出格式错误（本应返回数组但只返回了一个字符串）。

---

## 五、记忆维护 — 6.5/10

**文件**: [src/lib/decision-history.ts](src/lib/decision-history.ts)（62 行）+ [src/lib/reputation-feedback.ts](src/lib/reputation-feedback.ts)（36 行）

### 优点

1. **类型守卫设计良好**: `hasDecisionHistorySnapshot` 和 `hasBlueprintHistorySnapshot` 使用 TypeScript 的类型谓词（`x is T`），让调用方在条件分支后获得类型窄化——这是正确的 TypeScript 惯用法。

2. **反馈验证严格**: `reputation-feedback.ts` 使用三个 `Set` 做白名单校验（`validAgentIds`、`validDomains`、`validOutcomes`）。任何不符合的数据在 `toFeedbackRecord` 中返回 `[]`（静默丢弃）——虽然对用户不透明，但防止了无效数据污染声誉计算。

3. **存储上限合理**: 历史记录 12 条、反馈 60 条——在 localStorage 限制（5-10MB）下留有充足余量。

### 不足

1. **无时间衰减**: 声誉反馈不分新旧，3 个月前的反馈和昨天的反馈权重相同。模型能力是动态变化的（特别是基础模型升级后），旧反馈可能不再反映当前模型质量。

2. **无驱逐策略**: 超过上限时直接 `slice(0, limit)` 丢弃最旧数据。更合理的做法是保留最近的 + 保留评分最高/最低的（保留信息量最大的样本）。

3. **无数据导出/导入**: 用户换了浏览器或清除了 localStorage，所有决策历史和声誉反馈丢失，无法恢复。

4. **反馈维度单一**: 只有 `helpful/neutral/unhelpful` 三维。对于决策引擎，更细粒度的反馈（如"推理逻辑错误"vs"忽略了某方案"vs"评分不准确"）能提供更丰富的改进信号。

---

## 六、工程实现 — 6.5/10

**整体架构**: 3 层架构（React UI / Node.js API / Agent Platform），边界清晰。

### 优点

1. **Provider 抽象层设计优秀**: `server/providers/` 使用 `ModelProvider` 接口 + 中心注册表模式。添加新模型提供者只需实现接口并注册，不影响现有代码。这是开放-封闭原则的正确实践。

2. **错误处理在关键路径上到位**: `decision-api.ts` 有 17 个 try/catch 块，`live-decision.ts` 有 26 个。API 层对网络错误、JSON 解析错误、Provider 错误都有分类处理和回退策略。

3. **确定性模拟层设计巧妙**: `server/providers/mock.ts` 提供与真实 API 相同接口的确定性实现，使 CI 和 Demo 无需 API 密钥即可运行完整流程。

4. **测试覆盖总体不错**: 17 个测试文件，3363 行测试代码。评分算法测试（317 行）覆盖了所有 7 种机制。API 测试（671 行）覆盖了决策 API 的主要路径。

### 不足

1. **App.tsx 是 6000 行单体组件（最大工程债务）**: 一个文件包含所有 UI、状态、事件处理、双语文本、评分可视化、蓝图展示。这是本项目最严重的架构问题：
   - 难以测试（无法单独测试子组件）
   - 难以维护（修改一处可能影响全局）
   - 难以并行开发（整个文件成为瓶颈）
   - 代码审查困难（diff 6000 行文件几乎不可能）

   **建议拆分优先级**: (1) 提取 UI 组件到 `src/components/` (2) 提取状态管理到 `src/state/` 或使用 useReducer (3) 提取双语文本到独立 JSON 文件

2. **无集成测试**: 虽然有 `mock-e2e.ts`，但它测试的是确定性模拟路径，而非前端-服务器-真实 Provider 的集成链路。缺少对 `fetch('/api/decisions')` → Provider → 评分 → ADR 输出的端到端验证。

3. **TypeScript 严格模式未确认**: `tsconfig.json` 中没有看到 `"strict": true`。缺少 strict 模式意味着可能存在隐式 any、未检查的 null/undefined。

4. **无日志系统**: `server/` 中没有结构化日志（如 pino/winston），错误通过 `console.error` 输出，不便于生产环境监控和问题排查。

5. **无 API 版本控制**: `/api/decisions` 等端点无版本前缀（如 `/api/v1/decisions`），未来 API 变更时会破坏现有客户端。

---

## 七、中文支持 — 5.5/10（最低评分维度）

**文件**: [src/lib/localization.ts](src/lib/localization.ts)（75 行）

### 优点

1. **UI 层面双语覆盖完整**: `App.tsx` 中所有 UI 字符串都有中英文版本，locale 切换即时生效，用户体验好。

2. **翻译质量高**: 66 组短语的中文翻译准确且有技术文章感——不是机器翻译风格。例如 "Keep one deployable, harden module and access boundaries" → "保持单一部署单元，强化模块和访问边界" 是自然的技术中文。

### 不足

1. **localization.ts 是静态字符串替换引擎**:
   ```typescript
   return zhDecisionPhrases.reduce(
     (text, [source, replacement]) => text.replaceAll(source, replacement),
     value
   );
   ```
   这是最朴素的实现——对整个文本做 66 次 `replaceAll`。问题：
   - **O(n×m) 复杂度**: n 是文本长度，m 是短语数量，每次 replaceAll 都要遍历整个文本
   - **无上下文感知**: 如果一段英文恰好与某个短语匹配但不是决策输出，也会被替换
   - **无模板支持**: 无法处理 "Score: {score}/100" 这种带插值的文本
   - **不可扩展**: 每增加一条翻译就要修改代码重新编译

2. **翻译数据与代码耦合**: 66 组短语硬编码在 TypeScript 文件中。专业的做法是分离到 JSON/YAML 文件，支持非开发者贡献翻译。

3. **无 ICU MessageFormat 支持**: 无法处理复数形式（"1 proposal" vs "3 proposals"）、性别、序数等语法变体。

4. **仅覆盖 Demo Agent 输出**: `localizeKnownDecisionText` 只翻译确定性 Demo Agent 的输出。Real provider 输出和 UI 动态内容不做翻译——实际上 UI 文本是在 App.tsx 中通过 copy 对象处理的，但 provider 输出完全依赖 provider 自身的语言能力。

---

## 八、改进优先级建议

### 🔴 高优先级（影响可维护性和正确性）

| # | 问题 | 建议 | 预估工作量 |
|---|------|------|-----------|
| 1 | App.tsx 6000 行单体 | 拆分为 `components/` + `hooks/` + `i18n/` | 3-5 天 |
| 2 | 无运行时 schema 验证 | 用 Zod 为 Provider 输入添加验证层 | 1-2 天 |
| 3 | `CriteriaWeights = CriteriaScores` | 改为独立类型 | 30 分钟 |

### 🟡 中优先级（改善质量和用户体验）

| # | 问题 | 建议 | 预估工作量 |
|---|------|------|-----------|
| 4 | 中文翻译硬编码 | 提取到 JSON，支持动态加载 | 1 天 |
| 5 | AHP 一致性比率是近似值 | 实现标准 λmax 方法 | 2-3 天 |
| 6 | 无数据迁移框架 | 添加 version 字段 + 迁移函数 | 1 天 |
| 7 | 无 API 版本控制 | 添加 `/api/v1/` 前缀 | 2 小时 |

### 🟢 低优先级（锦上添花）

| # | 问题 | 建议 | 预估工作量 |
|---|------|------|-----------|
| 8 | 蒙特卡洛无收敛检测 | 添加排名稳定性检测 | 1 天 |
| 9 | 声誉反馈无时间衰减 | 添加指数衰减权重 | 半天 |
| 10 | 无结构化日志 | 引入 pino | 半天 |

---

## 九、与其他 MVP 的对比定位

| 维度 | QuorumMind | 典型 SaaS MVP | 典型开源工具 |
|------|-----------|---------------|-------------|
| 算法严谨性 | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ |
| 架构设计 | ★★★☆☆ | ★★☆☆☆ | ★★★☆☆ |
| 工程成熟度 | ★★☆☆☆ | ★★★☆☆ | ★★★★☆ |
| 测试覆盖 | ★★★☆☆ | ★★☆☆☆ | ★★★★☆ |
| 文档完整性 | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ |
| 国际化 | ★★☆☆☆ | ★☆☆☆☆ | ★★★☆☆ |

**定位**: QuorumMind 的算法核心（评分引擎 + 提取策略）达到或超过了同阶段产品的水平，但工程外围（UI 架构、i18n、持久化）处于 MVP 早期阶段。下一步的核心矛盾是**算法深度 vs 工程广度**——当前代码展示了"能做什么"，但距离"稳定可维护的产品"还需要 2-3 周的工程加固。

---

> 本评估基于源代码静态分析，未包含运行时性能测试或安全审计。
