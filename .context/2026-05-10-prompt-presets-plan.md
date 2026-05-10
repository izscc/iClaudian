# iClaudian 输入栏提示词预设悬浮菜单计划

## Summary
- 在输入工具栏中部（外部上下文/文件夹按钮之后、YOLO 权限开关之前）新增通用“提示词预设”按钮。
- 菜单默认鼠标悬浮展开；点击按钮可固定展开，方便在菜单内管理列表。
- 默认内置 1 条预设：名称 `翻译`，内容 `翻译`。
- 菜单支持两种执行模式：`填充` 和 `发送`；模式在菜单顶部切换并持久化。

## Key Changes
- 新增设置字段：`promptPresets` 和 `promptPresetMode`。
- 在 `InputToolbar` 新增 `PromptPresetMenu` 组件。
- 在 `Tab.ts` 连接 fill/send 行为。
- 新增 `src/style/toolbar/prompt-presets.css` 并导入。

## Test Plan
- 默认回退、fill/send 行为、CRUD 保存与刷新。
