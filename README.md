# iClaudian

![GitHub stars](https://img.shields.io/github/stars/izscc/iclaudian?style=social)
![GitHub release](https://img.shields.io/github/v/release/izscc/iclaudian)
![License](https://img.shields.io/github/license/izscc/iclaudian)

![预览](Preview.png)

**iClaudian** 是一个 Obsidian 桌面端插件，把常用 AI 编程代理直接嵌入到你的 Vault 侧边栏和行内编辑流程中。当前支持 Claude Code、Codex CLI、OpenCode、Gemini CLI、Antigravity CLI，以及 GitHub Copilot CLI（ACP）。你的 Vault 会作为代理工作目录，代理可以在授权范围内读取、搜索、编辑文件并执行多步骤任务。

## 核心功能

- **多提供方聊天**：在同一个聊天体验中切换 Claude、Codex、OpenCode、Gemini、Antigravity、Copilot 等运行时。
- **行内编辑**：选中文本或在光标位置触发快捷键，使用代理直接改写笔记，并显示词级 diff 预览。
- **对话与多标签**：支持多个聊天标签、历史会话、恢复、分叉、压缩上下文等工作流。
- **计划模式**：通过 `Shift+Tab` 切换 Plan 模式，让代理先探索和设计，再执行实现。
- **指令模式（`#`）**：在输入框中使用 `#` 精炼/追加本轮自定义指令。
- **命令与 Skills**：输入 `/` 或 `$` 调用 Vault 级、用户级命令与 Skills。
- **`@mention` 上下文**：可提及 Vault 文件、外部文件、子代理、MCP 服务器等上下文。
- **MCP 工具**：支持 Model Context Protocol。Claude 可在插件内管理 Vault MCP；Codex、Gemini、Copilot、OpenCode 使用各自 CLI 的 MCP/工具配置。
- **模型与推理配置**：提供方设置页可配置模型列表、上下文窗口、推理强度或权限模式。
- **本地优先存储**：会话元数据、提供方配置、命令、Skills 均保存在本地 Vault 或 CLI 原生目录中。

## 已支持提供方

| 提供方 | 启动方式 | 当前能力概览 |
|---|---|---|
| Claude Code | Claude Agent SDK / Claude Code CLI | 最完整：流式对话、取消、恢复、历史、分叉、rewind、Plan、图片、行内编辑、`#`、`/`、`$`、子代理、MCP、插件等 |
| Codex CLI | `codex app-server` | 发送、流式、取消、恢复、历史重载、分叉、Plan、图片、行内编辑、`#`、`$` Skills、子代理；部分运行时命令、MCP 管理、Claude 插件能力不适用 |
| OpenCode | OpenCode CLI | ACP/运行时模型发现、模型筛选、模式选择、命令下拉、行内编辑和标题生成等基础代理能力 |
| Gemini CLI | `gemini --acp` | ACP 会话、模型发现、Plan/YOLO 权限模式、运行时命令、MCP 由 Gemini CLI 管理 |
| Antigravity CLI | `agy --acp` | ACP 会话、模型发现、Plan/YOLO 权限模式、推理强度配置、运行时命令、MCP 由 Antigravity 管理 |
| GitHub Copilot CLI | `copilot --acp` | ACP 会话、模型选择、Plan/YOLO 权限模式、运行时命令；插件、MCP、BYOK 等由 Copilot CLI 管理 |

## GitHub Copilot CLI 模型 ID

根据 `copilot help config` 的模型清单确认，Copilot CLI 当前可用的真实模型 ID 包括：

```text
claude-sonnet-4.6
claude-sonnet-4.5
claude-haiku-4.5
claude-opus-4.7
claude-opus-4.6
claude-opus-4.6-fast
claude-opus-4.5
claude-sonnet-4
gpt-5.5
gpt-5.4
gpt-5.3-codex
gpt-5.2-codex
gpt-5.2
gpt-5.1
gpt-5.4-mini
gpt-5-mini
gpt-4.1
```

iClaudian 的 Copilot 设置页默认展示以下常用模型：

```text
gpt-5.5
gpt-5.4-mini
gpt-5-mini
gpt-4.1
claude-opus-4.7
claude-sonnet-4.6
claude-haiku-4.5
```

如需使用其他 Copilot CLI 模型，可在 **Settings → iClaudian → Copilot → Model IDs** 中每行填写一个模型 ID。

## 安装要求

- Obsidian v1.4.5+
- 桌面端系统：macOS、Linux、Windows
- 至少安装一个你要使用的 CLI：
  - Claude provider：安装 [Claude Code CLI](https://code.claude.com/docs/en/overview)
  - Codex provider：安装 [Codex CLI](https://github.com/openai/codex)
  - OpenCode provider：安装 [OpenCode](https://opencode.ai/)
  - Gemini provider：安装 Gemini CLI，并支持 `gemini --acp`
  - Copilot provider：安装 [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli)，并完成 `copilot login`

## 安装方式

### 从 GitHub Release 安装（推荐）

1. 从 [latest release](https://github.com/YishenTu/claudian/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在你的 Vault 中创建插件目录：

   ```text
   /path/to/vault/.obsidian/plugins/claudian/
   ```

3. 把下载的三个文件复制到该目录。
4. 在 Obsidian 中启用：Settings → Community plugins → Enable **iClaudian**。

### 使用 BRAT 安装

1. 安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 在 BRAT 设置中点击 “Add Beta plugin”。
3. 填入仓库地址：`https://github.com/izscc/iclaudian`。
4. 添加完成后，在社区插件中启用 **iClaudian**。

### 从源码开发

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/YishenTu/claudian.git
cd claudian
npm install
npm run build
```

开发模式：

```bash
npm run dev
```

## 常用配置

### CLI 路径

如果 Obsidian 无法从 GUI 环境的 PATH 中找到 CLI，可在对应提供方设置页填写绝对路径：

| 提供方 | macOS/Linux 示例 | Windows 示例 |
|---|---|---|
| Claude | `/Users/you/.volta/bin/claude` | `C:\Users\you\AppData\Local\Claude\claude.exe` |
| Codex | `/Users/you/bin/codex` | `C:\Users\you\AppData\Roaming\npm\codex.cmd` |
| Gemini | `/usr/local/bin/gemini` | `C:\Users\you\AppData\Roaming\npm\gemini.cmd` |
| Copilot | `/Users/you/.local/bin/copilot` | `C:\Users\you\AppData\Local\GitHubCopilot\copilot.exe` |
| OpenCode | `/usr/local/bin/opencode` | `C:\Users\you\AppData\Roaming\npm\opencode.cmd` |

> Windows 使用 Claude 时，优先使用 `claude.exe` 或 npm 包中的 `cli-wrapper.cjs`，不要使用 `.cmd` / `.ps1` 包装脚本。

### Copilot CLI 权限模式

Copilot provider 通过 ACP 启动：

- 默认：`copilot --acp --model <model>`
- YOLO：追加 `--allow-all`
- Plan：追加 `--plan`
- Auto Edit：追加 `--allow-tool write`

Copilot 的 MCP、插件、BYOK provider、登录状态等仍由 GitHub Copilot CLI 自身管理。

## 隐私与数据

- **会发送给模型提供方的数据**：你的输入、被引用/附加的文件、图片、工具调用结果，以及代理执行上下文。
- **本地存储**：
  - iClaudian 设置与会话元数据：`vault/.claudian/`
  - Claude Vault 配置：`vault/.claude/`
  - Codex Vault Skills/Agents：`vault/.codex/`、`vault/.agents/`
  - Claude 原生日志：`~/.claude/projects/`
  - Codex 原生日志：`~/.codex/sessions/`
  - Copilot 原生配置：`~/.copilot/`
- **无遥测**：插件本身不做额外追踪；实际请求由你配置的 CLI/provider 决定。

## 开发命令

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run lint:fix
npm run test
npm run test:watch
npm run test:coverage
```

## 目录结构

```text
src/
├── main.ts                      # 插件入口
├── app/                         # 默认设置与插件级存储
├── core/                        # 提供方无关的 runtime、registry、类型契约
├── providers/
│   ├── claude/                  # Claude SDK 适配、历史、MCP、插件、设置页
│   ├── codex/                   # Codex app-server、JSON-RPC、JSONL 历史、Skills、子代理
│   ├── opencode/                # OpenCode 适配、模型发现、模式管理
│   ├── gemini/                  # Gemini ACP 适配
│   ├── copilot/                 # GitHub Copilot CLI ACP 适配
│   └── acp/                     # ACP 共享客户端、传输、事件归一化
├── features/
│   ├── chat/                    # 侧边栏聊天、多标签、渲染器
│   ├── inline-edit/             # 行内编辑 Modal 与服务
│   └── settings/                # 设置页框架与通用设置区块
├── shared/                      # 通用 UI 组件
├── i18n/                        # 多语言翻译
├── utils/                       # 路径、环境变量、Markdown、图片、会话等工具
└── style/                       # 模块化 CSS
```

## 路线图

- [x] Claude Opus/Sonnet 1M 上下文模型
- [x] Codex provider 集成
- [x] OpenCode provider 集成
- [x] Gemini CLI ACP provider 集成
- [x] GitHub Copilot CLI ACP provider 集成
- [ ] 持续补齐各 provider 的原生命令、MCP、历史和跨平台安装体验

## License

基于 [MIT License](LICENSE) 发布。

## Acknowledgments

- [Obsidian](https://obsidian.md)
- [Anthropic](https://anthropic.com) 与 Claude Agent SDK
- [OpenAI](https://openai.com) 与 Codex
- [OpenCode](https://opencode.ai/)
- [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli)
