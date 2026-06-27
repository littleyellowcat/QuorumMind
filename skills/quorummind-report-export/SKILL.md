---
name: quorummind-report-export
description: QuorumMind report-export method for producing clean ADR, blueprint, professional audit, and simplified final-solution PDFs. Use when generating or reviewing导出报告,PDF,ADR,简版方案,专业报告,or ensuring exported content matches the current question and result.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [导出, 报告, PDF, ADR, 文档, 简版, 专业版, export, report, document]
inject: both
-->

# QuorumMind Report Export

## Report Types

- Simple final-solution PDF: only the user question, final recommendation/blueprint, concrete steps, risks, and next actions.
- Professional report: include trace, scoring, model contributions, schema status, dissent, and audit metadata.
- ADR: include context, decision, alternatives, consequences, risks, and review triggers.
- Blueprint: include goal, workflow, schemas, agent/module responsibilities, milestones, acceptance criteria, and backlog.

## Export Rules

- The exported topic must match the current question, never stale demo content.
- Keep simplified PDFs readable for non-experts; remove provider trace and debugging details.
- Preserve Chinese locale in headings and body.
- Show live/fallback source when the report claims model-generated analysis.
