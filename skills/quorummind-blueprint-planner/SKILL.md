---
name: quorummind-blueprint-planner
description: QuorumMind blueprint method for turning open-ended product, engineering, AI-agent, workflow, or content-system requests into a complete implementation plan. Use for方案蓝图,需求书,工作流设计,agent分工,数据字段,里程碑,验收标准,backlog,or detailed roadmap generation.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [蓝图, 方案, 需求书, 工作流, agent, 多agent, multi-agent, 字段, schema, roadmap, backlog, implementation, workflow]
inject: blueprint
-->

# QuorumMind Blueprint Planner

## Workflow

1. Convert the user request into a target outcome, user roles, operating constraints, and success criteria.
2. Break the system into modules, agents, data objects, workflows, review gates, and observability points.
3. Give a complete first version, then critique it for missing context, weak assumptions, cost, latency, safety, and maintainability.
4. Revise the blueprint until it is implementable by a small team.
5. End with an issue-level backlog that has priority, owner, effort, dependencies, deliverables, acceptance checks, and skip risk.

## Blueprint Must Cover

- Product goal and non-goals.
- Agent responsibilities and handoff rules when agents are involved.
- Data schemas, field definitions, state transitions, and validation rules.
- Core workflow, exception workflow, human review, and rollback.
- Milestones, test strategy, evaluation metrics, risks, and open questions.
- Concrete next actions, not generic advice.
