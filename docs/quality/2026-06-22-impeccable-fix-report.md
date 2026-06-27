# QuorumMind Impeccable 修复记录

日期：2026-06-22

## 背景

本轮基于 `.impeccable/critique/2026-06-22T05-30-39Z__src-app-tsx.md` 修复前端体验问题。没有触发真实模型 API。

## 修复内容

| 问题 | 修复 |
| --- | --- |
| 英文首屏 H1 横向溢出 | 移除宽屏 `white-space: nowrap`，收紧标题字距，改为固定字号分档 |
| Hero eyebrow 味道过重 | 移除首屏 `Workspace/工作区` 小标题 |
| 蓝图模式左栏过长 | 将 Agent runtime、系统状态、专家委员会、上下文流程、历史记录折叠为高级区 |
| `.workspace-grid` 裁切 tooltip | 外层 grid 改为 `overflow: visible`，保留三栏自身滚动 |
| 导出报告 side-tab border | `src/lib/exporters.ts` 中问题块改为完整边框和圆角浅底 |
| 移动端触控目标偏小 | segmented controls、语言切换和 tooltip 触控尺寸提升 |
| 小字低于 12px | 就绪检查、Provider 测试、Agent 声誉说明文字提升到可读尺寸 |
| 卡片套卡片观感 | 去掉左栏外层卡片壳，让各设置块独立成组 |

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Impeccable source detector | `[]`，无源码级 finding |
| Browser detector | 仅剩 `single-font`，判定为产品 UI 系统字体栈的可接受误报 |
| 英文桌面横向溢出 | `bodyScrollWidth 1440 / innerWidth 1440`，已清零 |
| 中文蓝图横向溢出 | 无 |
| 蓝图左栏高度 | 从约 `4257px` 降到约 `1467px` |
| 干净移动端按钮触控 | 可见应用按钮无低于 `44px` |
| Build | `npm run build` 通过 |
| Targeted tests | `src/App.test.tsx`、`src/lib/exporters.test.ts` 全部通过 |

## 产物

- `output/impeccable/detect-src-after-fixes-2.json`
- `output/impeccable/browser-detect-final.json`
- `output/playwright/impeccable-final-desktop-en.png`
- `output/playwright/impeccable-final-blueprint-zh.png`
- `output/playwright/impeccable-final-mobile-clean-zh.png`

## 备注

Browser detector 最终剩余 `single-font`。根据 Impeccable product register，产品 UI 使用系统 sans 字体栈是允许的；这里不引入第二字体，以避免破坏工具型界面的稳定性。
