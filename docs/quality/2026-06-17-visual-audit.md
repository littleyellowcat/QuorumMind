# QuorumMind 视觉回归审计记录

日期：2026-06-17

## 范围

- 桌面视口：1440x1100。
- 移动视口：390x844。
- 长中文问题输入。
- 运行后结果页。
- Blueprint 模式输入和运行后结果页。
- Tooltip 悬浮显示。
- ADR / JSON / 报告 / Prompt 导出按钮可见性。
- 蓝图导出 / PDF 报告 / 复制蓝图 / Prompt 导出按钮可见性。
- 文档级横向溢出和按钮文字溢出。

## 运行环境

- API：127.0.0.1:57017
- Web：127.0.0.1:57018
- Provider：mock live，不消耗真实 API。
- 截图目录：`output/playwright/visual-audit`

## 汇总

| 指标 | 结果 |
| --- | ---: |
| 检查项 | 23 |
| 失败项 | 0 |
| 通过率 | 100% |

## 明细

| 检查 | 状态 | 说明 |
| --- | --- | --- |
| API health | passed | http://127.0.0.1:57017/api/health is reachable. |
| Vite web | passed | http://127.0.0.1:57018 is reachable. |
| desktop input overflow | passed | No document-level horizontal overflow detected. |
| desktop input button fit | passed | Button text fits within rendered controls. |
| desktop result overflow | passed | No document-level horizontal overflow detected. |
| desktop result button fit | passed | Button text fits within rendered controls. |
| desktop result exports | passed | Export and prompt buttons are visible after a run. |
| desktop tooltip | passed | Tooltip is visible after hovering a metric help button. |
| desktop blueprint input overflow | passed | No document-level horizontal overflow detected. |
| desktop blueprint input button fit | passed | Button text fits within rendered controls. |
| desktop blueprint result overflow | passed | No document-level horizontal overflow detected. |
| desktop blueprint result button fit | passed | Button text fits within rendered controls. |
| desktop blueprint result exports | passed | Blueprint export, copy, and prompt buttons are visible after a run. |
| mobile input overflow | passed | No document-level horizontal overflow detected. |
| mobile input button fit | passed | Button text fits within rendered controls. |
| mobile result overflow | passed | No document-level horizontal overflow detected. |
| mobile result button fit | passed | Button text fits within rendered controls. |
| mobile result exports | passed | Export and prompt buttons are visible after a run. |
| mobile blueprint input overflow | passed | No document-level horizontal overflow detected. |
| mobile blueprint input button fit | passed | Button text fits within rendered controls. |
| mobile blueprint result overflow | passed | No document-level horizontal overflow detected. |
| mobile blueprint result button fit | passed | Button text fits within rendered controls. |
| mobile blueprint result exports | passed | Blueprint export, copy, and prompt buttons are visible after a run. |
