# iClaudian：Gemini CLI 引入、汉化、Obsidian 跑通与 GitHub 发版计划

## Summary
- 以 `/Users/zscc.in/Desktop/AI/iClaudian` 为最终源码仓库；当前目录为空，默认从 [YishenTu/claudian](https://github.com/YishenTu/claudian) 最新主线重建，并保留本机已安装 Claudian 2.0.10 的 OpenCode/Codex 行为作为对照。
- 项目发布为 `izscc/iClaudian`，插件标识改为 `iclaudian`、显示名 `iClaudian`，避免覆盖现有 `.obsidian/plugins/claudian`。
- Gemini CLI 已存在：`gemini 0.40.1`，支持 `--acp`、`--approval-mode`、`mcp`、`skills`，因此 Gemini Provider 采用 ACP 常驻会话方式实现，而不是一次性 `gemini -p`。

## Key Changes
- 新增 `Gemini` Provider：Provider ID `gemini`，通过 `gemini --acp` 启动常驻 ACP runtime，支持 CLI 路径、环境变量、模型选择、Safe/Plan/Auto Edit/YOLO 映射到 `--approval-mode`。
- 汉化补齐：Codex、OpenCode、Gemini 设置页所有硬编码英文迁移到 i18n；修复截图中未汉化项；`zh-CN` 默认优先体验。
- 品牌与发布：统一 `iClaudian`，构建产物三件套，创建 `izscc/iClaudian` 并发版。

## Test Plan
- `npm install`、`npm run typecheck`、`npm test`、`npm run build`。
- `gemini --help` 确认 `--acp`、`--approval-mode` 可用；Gemini ACP runtime 启动/初始化/发送一轮，429 记录为服务端容量问题。
- 备份现有 `.obsidian/plugins/claudian`，安装到 `.obsidian/plugins/iclaudian`，用 Obsidian 验证设置页与聊天能力。
- 从 GitHub Release 下载三件套重装验证。
