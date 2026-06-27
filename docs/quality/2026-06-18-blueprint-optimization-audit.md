# 2026-06-18 Blueprint Optimization Audit

## 本轮目标

继续增强 Blueprint 模式，让开放式问题的输出更接近可审查的多 Agent 方案生成流程：

- 每次运行不仅给最终蓝图，还要给终局质量评估。
- 建议部分要足够详细，包含负责方、原因、行动清单、预期影响和验收检查。
- 真实模型贡献需要继续保留来源边界，并纳入可追踪的改进建议。
- 导出报告需要同步包含这些审查内容。

## 新增能力

### 终局评估矩阵

新增 6 个评估维度：

- 目标匹配度
- 工作流完整性
- Schema 严谨度
- 风险控制
- 交付可执行性
- 可审查性

每个维度包含：

- 0-100 评分
- 状态：稳健 / 需关注 / 薄弱
- 评估理由
- 评估证据
- 改进动作

评分不是固定展示值，会根据最终共识分、工作流数量、Schema 覆盖、质询数量、修订数量和真实模型贡献进行调整。

### 详细优化建议

新增结构化建议清单，每条建议包含：

- 优先级
- 负责 Agent
- 原因
- 行动清单
- 预期影响
- 验收检查

当前默认覆盖：

- 样本回归包
- 状态机契约
- Schema fixture
- 人工复审队列
- MVP 范围锁定
- 报告来源可信度

如果真实模型返回可用结构化贡献，会追加“把真实模型贡献纳入可追踪证据链”的建议。

### 质询采纳账本

新增交叉质询采纳账本，用于说明每条 Agent 质询建议如何影响最终蓝图。

每条记录包含：

- 质询来源 Agent
- 被质询草案
- 原始建议
- 采纳状态：已采纳 / 部分采纳 / 延期验证
- 进入的目标章节
- 处理说明
- 证据

这个账本解决的问题是：用户不只看到“多轮讨论”这个过程标签，还能看到讨论结果是否真的被吸收到最终方案中。

### 实施任务清单

新增 issue 级实施任务清单，用于把蓝图直接转成可执行工作项。

每条任务包含：

- 优先级
- 负责 Agent
- 所属阶段
- 预估工作量
- 依赖
- 交付物
- 验收标准
- 跳过风险

视觉小说 / 多 Agent 场景会默认生成更具体的任务，例如章节接入、Schema fixture、StoryState 抽取、人物记忆、场景对白、资产需求、一致性审校、导出包和回归测试。

## 展示与导出

已同步到：

- Blueprint 主结果页
- Blueprint Markdown 导出
- Blueprint 可打印 HTML/PDF 报告
- 真实模型 Prompt 包

## 验证结果

已通过：

- `npm test -- --run src/lib/blueprint.test.ts src/lib/exporters.test.ts src/App.test.tsx server/decision-api.test.ts`
- `npm run build`
- `npm test -- --run`：26 个测试文件，111 个测试通过
- `npm run quality:audit`：24 个系统质量样本，综合通过率 100%
- `npm run mock:e2e`：mock live provider E2E 通过
- `npm run visual:audit`：23 个浏览器视觉检查，0 失败
- `git diff --check`

## 追加验证

新增“质询采纳账本”后再次验证：

- `npm test -- --run src/lib/blueprint.test.ts src/lib/exporters.test.ts src/App.test.tsx server/decision-api.test.ts`
- `npm run build`
- `npm test -- --run`：26 个测试文件，111 个测试通过
- `npm run quality:audit`：24 个系统质量样本，综合通过率 100%
- `npm run mock:e2e`
- `npm run visual:audit`：23 个浏览器视觉检查，0 失败
- `git diff --check`

新增“实施任务清单”后再次验证：

- `npm test -- --run src/lib/blueprint.test.ts src/lib/exporters.test.ts src/App.test.tsx server/decision-api.test.ts`
- `npm run build`
- `npm test -- --run`：26 个测试文件，111 个测试通过
- `npm run quality:audit`：24 个系统质量样本，综合通过率 100%
- `npm run mock:e2e`
- `npm run visual:audit`：23 个浏览器视觉检查，0 失败
- `git diff --check`
