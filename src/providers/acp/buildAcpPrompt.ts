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
  let prompt = request.text;

  if (request.currentNotePath) {
    prompt = appendCurrentNote(prompt, request.currentNotePath);
    // ACP agents get no system prompt, so the tag semantics Claude learns from
    // mainAgent.ts must travel inline — otherwise models treat the bare tag as
    // noise and pick "plausible" files out of their own directory listing.
    prompt += '\n(The <current_note> above is the note currently open in Obsidian, path relative to the vault root. Unless the user names a different file, this request refers to that note. Use this exact path with your file tools; do not search for the file. If the user asks for this/current note only, do not scan folders or discover other Markdown files.)';
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
