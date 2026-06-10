import * as path from 'node:path';

import type { ChatTurnRequest } from '../../core/runtime/types';
import type { ChatMessage } from '../../core/types';
import { appendBrowserContext } from '../../utils/browser';
import { appendCanvasContext } from '../../utils/canvas';
import { appendCurrentNote } from '../../utils/context';
import { appendEditorContext } from '../../utils/editor';
import { buildBoundedContextFromHistory, buildPromptWithHistoryContext } from '../../utils/session';
import type { AcpContentBlock } from './types';

// Inlined history shares one prompt with the actual request; unbounded inlining of a
// long conversation can blow past the agent's context window and clip the request
// itself (observed with gemini-cli mid-turn compression). Keep a recent window only.
const ACP_HISTORY_MAX_MESSAGES = 16;
const ACP_HISTORY_MAX_CHARS = 24_000;

export function buildAcpPromptText(
  request: ChatTurnRequest,
  conversationHistory: ChatMessage[] = [],
): string {
  let prompt = request.currentNotePath
    ? rewriteCurrentNoteSkillTrigger(request.text, request.currentNotePath)
    : request.text;

  if (request.currentNotePath) {
    prompt = appendCurrentNote(prompt, request.currentNotePath);
    // ACP agents get no system prompt, so the tag semantics Claude learns from
    // mainAgent.ts must travel inline — otherwise models treat the bare tag as
    // noise and pick "plausible" files out of their own directory listing.
    prompt += [
      '',
      '<current_note_task>',
      `用户已指定目标 Markdown 文件路径：${request.currentNotePath}`,
      '这是本轮请求的唯一目标文件。请把这个路径直接当作用户提供的文件路径参数使用。',
      '不要要求用户再提供文件名，不要扫描目录来寻找其他候选文件，不要切换到其他 Obsidian 清理/整理任务。',
      '如果用户要求翻译、整理、编辑或优化笔记，请读取并写回这个 exact Markdown 文件，而不是只描述计划。',
      '不要只激活技能或设置上下文后等待下一条指令；本轮消息已经包含完整任务，必须立即执行。',
      'read and update this exact Markdown file. Do not ask which file to use.',
      'execute the requested translation/edit now; do not stop after activating a skill or setting context.',
      '</current_note_task>',
      '(The <current_note> above is the note currently open in Obsidian, path relative to the vault root. Unless the user names a different file, this request refers to that note. Use this exact path with your file tools; do not search for the file.)',
    ].join('\n');
  }

  if (request.externalContextPaths && request.externalContextPaths.length > 0) {
    prompt += [
      '',
      '<external_context_paths>',
      ...request.externalContextPaths.map(contextPath => contextPath.trim()).filter(Boolean),
      '</external_context_paths>',
      '(The <external_context_paths> above are the only external folders selected for this turn. Treat them as the locked search scope for file discovery. Do not search outside these paths unless the user explicitly names another path. If a current note is provided, operate on that exact note first.)',
    ].join('\n');
  }

  if (request.editorSelection && request.editorSelection.mode !== 'none') {
    prompt = appendEditorContext(prompt, request.editorSelection);
  }

  if (request.browserSelection) {
    prompt = appendBrowserContext(prompt, request.browserSelection);
  }

  if (request.canvasSelection) {
    prompt = appendCanvasContext(prompt, request.canvasSelection);
  }

  if (conversationHistory.length > 0) {
    const historyContext = buildBoundedContextFromHistory(conversationHistory, {
      maxChars: ACP_HISTORY_MAX_CHARS,
      maxMessages: ACP_HISTORY_MAX_MESSAGES,
    });
    prompt = buildPromptWithHistoryContext(
      historyContext,
      prompt,
      prompt,
      conversationHistory,
    );
  }

  return prompt;
}

function rewriteCurrentNoteSkillTrigger(text: string, currentNotePath: string): string {
  if (!/\$md-translator\b/.test(text)) return text;
  const userInstruction = text.replace(/\$md-translator\b/g, '').trim() || '翻译整理这条笔记';
  return [
    userInstruction,
    '',
    '请按 md-translator 技能规则立即执行当前笔记翻译任务，但不要触发或停留在 Gemini CLI 的 `$md-translator` 技能激活流程。',
    `目标文件路径：${currentNotePath}`,
    '执行要求：读取该 exact Markdown 文件，完整翻译为简体中文，保持 Frontmatter、图片链接、标签、引用和排版结构，必要时按内容重命名，最后写回文件。',
    '禁止：不要扫描目录，不要寻找其他候选文件，不要只说明 skill 已激活，不要等待下一条指令。',
  ].join('\n');
}

export interface AcpPromptBlockOptions {
  /**
   * Vault root for resolving relative context paths. When set, the current note is
   * also attached as a file:// resource_link block — capable agents (gemini-cli's
   * @-path pipeline) then ingest the file content natively instead of re-finding it
   * with their own file tools, which is where weaker models hallucinate paths.
   */
  fileResourceBaseDir?: string;
}

export function buildAcpPromptBlocks(
  request: ChatTurnRequest,
  conversationHistory: ChatMessage[] = [],
  options?: AcpPromptBlockOptions,
): AcpContentBlock[] {
  const blocks: AcpContentBlock[] = [
    { type: 'text', text: buildAcpPromptText(request, conversationHistory) },
  ];

  for (const image of request.images ?? []) {
    if (!image.data) {
      continue;
    }

    blocks.push({
      data: image.data,
      mimeType: image.mediaType,
      type: 'image',
    });
  }

  if (options?.fileResourceBaseDir && request.currentNotePath) {
    const absolutePath = path.isAbsolute(request.currentNotePath)
      ? request.currentNotePath
      : path.join(options.fileResourceBaseDir, request.currentNotePath);
    blocks.push({
      name: path.basename(request.currentNotePath),
      type: 'resource_link',
      // gemini-cli slices the file:// prefix off verbatim, so the path must stay
      // unencoded even though that is not a strictly valid URI.
      uri: `file://${absolutePath}`,
    });
  }

  return blocks;
}
