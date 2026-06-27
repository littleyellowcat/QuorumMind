# QuorumMind 视觉回归审计记录

日期：2026-06-22

## 范围

- 桌面视口：1440x1100。
- 窄桌面视口：1024x900。
- 移动视口：390x844。
- 长中文问题输入。
- 运行后结果页。
- Blueprint 模式输入和运行后结果页。
- 左 / 中 / 右三栏独立滚动验证。
- 窄屏和移动端响应式滚动验证。
- Tooltip 悬浮显示。
- ADR / JSON / 报告 / Prompt 导出按钮可见性。
- 蓝图导出 / PDF 报告 / 复制蓝图 / Prompt 导出按钮可见性。
- 中文模式可见文本残留英文扫描。
- 中文 ADR、决策报告、蓝图报告、任务清单和蓝图正文导出残留英文扫描。
- 文档级横向溢出和按钮文字溢出。

## 运行环境

- API：127.0.0.1:62462
- Web：127.0.0.1:62463
- Provider：mock live，不消耗真实 API。
- 截图目录：`output/playwright/visual-audit`

## 汇总

| 指标 | 结果 |
| --- | ---: |
| 检查项 | 59 |
| 失败项 | 0 |
| 通过率 | 100% |

## 明细

| 检查 | 状态 | 说明 |
| --- | --- | --- |
| API health | passed | http://127.0.0.1:62462/api/health is reachable. |
| Vite web | passed | http://127.0.0.1:62463 is reachable. |
| desktop setup | passed | Onboarding, setup readiness, and security sharing hints are visible in Chinese mode. |
| desktop setup zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| desktop input overflow | passed | No document-level horizontal overflow detected. |
| desktop input button fit | passed | Button text fits within rendered controls. |
| desktop input panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| desktop result overflow | passed | No document-level horizontal overflow detected. |
| desktop result button fit | passed | Button text fits within rendered controls. |
| desktop result panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| desktop result independent scroll | passed | Center result column scrolls independently from setup, inspector, and document scroll. |
| desktop result zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| desktop result exports | passed | Export and prompt buttons are visible after a run. |
| desktop tooltip | passed | Tooltip is inside the viewport. |
| desktop tooltip | passed | Tooltip is visible after hovering a metric help button. |
| desktop blueprint input overflow | passed | No document-level horizontal overflow detected. |
| desktop blueprint input button fit | passed | Button text fits within rendered controls. |
| desktop blueprint input panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| desktop blueprint result overflow | passed | No document-level horizontal overflow detected. |
| desktop blueprint result button fit | passed | Button text fits within rendered controls. |
| desktop blueprint result panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| desktop blueprint result zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| desktop blueprint result exports | passed | Blueprint export, copy, and prompt buttons are visible after a run. |
| narrow input overflow | passed | No document-level horizontal overflow detected. |
| narrow input button fit | passed | Button text fits within rendered controls. |
| narrow input panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| narrow input responsive scroll | passed | Narrow/mobile layout uses document scrolling without hidden clipped columns. |
| narrow result overflow | passed | No document-level horizontal overflow detected. |
| narrow result button fit | passed | Button text fits within rendered controls. |
| narrow result panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| narrow result responsive scroll | passed | Narrow/mobile layout uses document scrolling without hidden clipped columns. |
| narrow result zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| narrow blueprint input overflow | passed | No document-level horizontal overflow detected. |
| narrow blueprint input button fit | passed | Button text fits within rendered controls. |
| narrow blueprint input panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| narrow blueprint result overflow | passed | No document-level horizontal overflow detected. |
| narrow blueprint result button fit | passed | Button text fits within rendered controls. |
| narrow blueprint result panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| narrow blueprint result zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| narrow blueprint result exports | passed | Blueprint export, copy, and prompt buttons are visible after a run. |
| mobile input overflow | passed | No document-level horizontal overflow detected. |
| mobile input button fit | passed | Button text fits within rendered controls. |
| mobile input panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| mobile input responsive scroll | passed | Narrow/mobile layout uses document scrolling without hidden clipped columns. |
| mobile result overflow | passed | No document-level horizontal overflow detected. |
| mobile result button fit | passed | Button text fits within rendered controls. |
| mobile result panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| mobile result responsive scroll | passed | Narrow/mobile layout uses document scrolling without hidden clipped columns. |
| mobile result zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| mobile result exports | passed | Export and prompt buttons are visible after a run. |
| mobile blueprint input overflow | passed | No document-level horizontal overflow detected. |
| mobile blueprint input button fit | passed | Button text fits within rendered controls. |
| mobile blueprint input panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| mobile blueprint result overflow | passed | No document-level horizontal overflow detected. |
| mobile blueprint result button fit | passed | Button text fits within rendered controls. |
| mobile blueprint result panels | passed | Primary setup, result, and inspector panels are nonblank and have stable dimensions. |
| mobile blueprint result zh remnants | passed | No known English UI remnants were visible in Chinese mode. |
| mobile blueprint result exports | passed | Blueprint export, copy, and prompt buttons are visible after a run. |
| Chinese export remnants | passed | ADR, decision HTML report, Blueprint HTML report, backlog, and Blueprint body have no known English label remnants. |
