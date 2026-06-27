# QuorumMind Skill 治理策略

日期：2026-06-18

项目现在把 agent 执行规则放在两个位置：

- `AGENTS.md`：兼容 coding agent 可读取的项目级规则。
- `skills/quorummind-token-guard/SKILL.md`：项目内可复用 skill，用于控制预算、重试、验证和模型来源透明度。

## 覆盖范围

- 非简单任务在探索和实现前，要先声明紧凑预算。
- 同一子问题如果在没有新证据的情况下失败两次，要停止盲目重试并说明阻塞点。
- 真实模型/API 调用必须记录 provider、超时、解析状态、schema 状态、兜底状态和最终内容来源。
- UI、API、导出、Blueprint、Decision 相关改动先跑最小有意义验证，再根据影响面扩大。
- dirty worktree 中的用户改动不能被回滚，除非用户明确要求。

## QuorumMind 质量门

| 工作类型 | 最小验证 |
| --- | --- |
| 文档或 skill 规则 | 直接检查文件并运行 `git diff --check` |
| Blueprint 逻辑 | 定向运行 `src/lib/blueprint.test.ts` 和受影响的导出/UI 测试 |
| Decision 工作流/评分 | 定向运行 workflow/scoring 测试 |
| API/provider 行为 | server 测试加 mock provider/schema 检查 |
| 前端布局或交互 | 定向 UI 测试；有明显布局影响时加视觉审计 |
| 真实模型回归 | 带预算的 live audit，记录 provider、schema、fallback、中文和相关性 |

## 来源透明策略

QuorumMind 必须区分这些输出来源：

- 真实模型输出：由已配置 provider 生成，并且 schema 可用。
- 修复后的真实模型输出：由 provider 生成，随后经过 schema hardening 归一化或修复。
- 确定性合成：由 QuorumMind 本地兜底逻辑生成。
- 混合输出：最终结果同时包含真实模型贡献和确定性合成。

报告和 UI 不应把确定性合成暗示成真实模型推理。

## 当前状态

- 已新增项目级 guard 文件。
- 已新增项目内 `quorummind-token-guard` skill。
- 已新增 8 个 QuorumMind 方法论 skill，位于 `skills/quorummind-*/SKILL.md`：
  - `quorummind-decision-review`：决策室取舍、ADR、共识/分歧解释。
  - `quorummind-blueprint-planner`：开放式需求转完整实施蓝图。
  - `quorummind-consensus-loop`：多模型独立提案、盲审、修订、阈值终止。
  - `quorummind-agent-eval`：AgentEval 响应质量、轨迹、schema、成本、延迟评估。
  - `quorummind-live-model-qa`：真实模型调用、中文相关性、schema/fallback 质量门。
  - `quorummind-report-export`：ADR、蓝图、专业报告、简版 PDF 导出规范。
  - `quorummind-zh-localization`：中文术语、残留英文、长中文排版和导出中文一致性。
  - `quorummind-security-guard`：API Token、CORS、限流、请求体、日志和导出安全。
- 运行时 skill loader 现在支持两类来源：
  - 用户数据目录：`~/.quorummind/skills/*.md`
  - 项目内目录式 skill：`skills/quorummind-*/SKILL.md`
- 目录式 skill 的 Codex frontmatter 只保留 `name` 和 `description`；QuorumMind 运行时元数据放在 `<!-- quorummind-skill ... -->` 注释块中，避免破坏 Codex skill 校验。
- Blueprint live provider prompt 现在会注入匹配到的 `blueprint` / `both` 项目方法论 skill。
- 现有 API 安全、schema 修复、fallback 标识、provider 连接测试和质量审计仍然是运行时保障层。
- 当前治理层是流程约束，用来指导 agent 行为；它不替代服务端 API 安全和自动化测试。
