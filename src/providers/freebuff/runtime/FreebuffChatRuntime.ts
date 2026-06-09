import { type ChildProcess, spawn } from 'node:child_process';

import type { ProviderCapabilities } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnResult,
  ChatRewindMode,
  ChatRewindResult,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  PreparedChatTurn,
  SessionUpdateResult,
  SubagentRuntimeState,
} from '../../../core/runtime/types';
import type {
  ChatMessage,
  Conversation,
  ExitPlanModeCallback,
  SlashCommand,
  StreamChunk,
  ToolCallInfo,
} from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { FREEBUFF_PROVIDER_CAPABILITIES } from '../capabilities';
import { isFreebuffModelSelectionId } from '../models';
import { getFreebuffProviderSettings } from '../settings';
import { buildFreebuffPromptText } from './buildFreebuffPrompt';
import { buildFreebuffCliInvocation } from './FreebuffCliInvocation';
import { buildFreebuffRuntimeEnv } from './FreebuffRuntimeEnvironment';

export class FreebuffChatRuntime implements ChatRuntime {
  readonly providerId = 'freebuff' as const;

  private currentTurnMetadata: ChatTurnMetadata = {};
  private process: ChildProcess | null = null;
  private readonly readyListeners: Array<(ready: boolean) => void> = [];
  private ready = false;
  private sessionId: string | null = null;
  private sessionInvalidated = false;

  constructor(private readonly plugin: ClaudianPlugin) {}

  getCapabilities(): Readonly<ProviderCapabilities> { return FREEBUFF_PROVIDER_CAPABILITIES; }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return {
      isCompact: false,
      mcpMentions: request.enabledMcpServers ?? new Set(),
      persistedContent: '',
      prompt: buildFreebuffPromptText(request),
      request,
    };
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.push(listener);
    return () => {
      const index = this.readyListeners.indexOf(listener);
      if (index >= 0) this.readyListeners.splice(index, 1);
    };
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(conversation: { sessionId?: string | null } | null): void {
    if (this.sessionId !== (conversation?.sessionId ?? null)) {
      this.sessionInvalidated = false;
    }
    this.sessionId = conversation?.sessionId ?? null;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const settings = getFreebuffProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    if (!settings.enabled) {
      this.setReady(false);
      return false;
    }
    if (!this.sessionId) this.sessionId = `freebuff-${Date.now()}`;
    this.setReady(true);
    return true;
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    if (!(await this.ensureReady())) {
      yield { type: 'error', content: 'Failed to start Freebuff. Enable the provider and check the CLI path/login state.' };
      yield { type: 'done' };
      return;
    }

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const prompt = buildFreebuffPromptText(turn.request, conversationHistory ?? []);
    const selectedModel = this.resolveSelectedModel(queryOptions);
    const configuredCliPath = this.plugin.getResolvedProviderCliPath('freebuff');
    const invocation = buildFreebuffCliInvocation({ configuredCliPath, cwd, prompt, selectedModel });
    const env = buildFreebuffRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, invocation.command);

    try {
      yield* this.runCli(invocation.command, invocation.args, invocation.stdinText, cwd, env);
    } catch (error) {
      yield { type: 'error', content: this.formatRuntimeError(error) };
    }
    yield { type: 'done' };
  }

  cancel(): void {
    this.process?.kill('SIGTERM');
    this.process = null;
  }

  resetSession(): void {
    this.cancel();
    this.sessionId = `freebuff-${Date.now()}`;
    this.sessionInvalidated = true;
  }

  getSessionId(): string | null { return this.sessionId; }
  consumeSessionInvalidation(): boolean { const value = this.sessionInvalidated; this.sessionInvalidated = false; return value; }
  isReady(): boolean { return this.ready; }
  async getSupportedCommands(): Promise<SlashCommand[]> { return []; }
  getAuxiliaryModel(): string | null { return this.resolveSelectedModel(); }
  cleanup(): void { this.cancel(); this.setReady(false); }
  async rewind(_userMessageId: string, _assistantMessageId: string, _mode?: ChatRewindMode): Promise<ChatRewindResult> { return { canRewind: false }; }
  setApprovalCallback(_callback: ApprovalCallback | null): void {}
  setApprovalDismisser(_dismisser: (() => void) | null): void {}
  setAskUserQuestionCallback(_callback: AskUserQuestionCallback | null): void {}
  setExitPlanModeCallback(_callback: ExitPlanModeCallback | null): void {}
  setPermissionModeSyncCallback(_callback: ((sdkMode: string) => void) | null): void {}
  setSubagentHookProvider(_getState: () => SubagentRuntimeState): void {}
  setAutoTurnCallback(_callback: ((result: AutoTurnResult) => void) | null): void {}
  consumeTurnMetadata(): ChatTurnMetadata { const metadata = this.currentTurnMetadata; this.currentTurnMetadata = {}; return metadata; }

  buildSessionUpdates(params: { conversation: Conversation | null; sessionInvalidated: boolean }): SessionUpdateResult {
    return {
      updates: {
        providerState: undefined,
        sessionId: params.sessionInvalidated && !this.sessionId ? null : this.sessionId,
      },
    };
  }

  resolveSessionIdForFork(conversation: Conversation | null): string | null { return this.sessionId ?? conversation?.sessionId ?? null; }
  async loadSubagentToolCalls(_agentId: string): Promise<ToolCallInfo[]> { return []; }
  async loadSubagentFinalResult(_agentId: string): Promise<string | null> { return null; }

  private resolveSelectedModel(queryOptions?: ChatRuntimeQueryOptions): string {
    const selectedModel = typeof queryOptions?.model === 'string'
      ? queryOptions.model
      : typeof this.plugin.settings.model === 'string'
        ? this.plugin.settings.model
        : '';
    return selectedModel && isFreebuffModelSelectionId(selectedModel) ? selectedModel : 'freebuff:freebuff';
  }

  private async *runCli(
    command: string,
    args: string[],
    stdinText: string | null,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): AsyncGenerator<StreamChunk> {
    const queue: StreamChunk[] = [];
    const waiters: Array<() => void> = [];
    let done = false;
    let stdout = '';
    let stderr = '';

    const wake = (): void => {
      while (waiters.length) waiters.shift()?.();
    };
    const push = (chunk: StreamChunk): void => {
      queue.push(chunk);
      wake();
    };
    const waitForChunk = async (): Promise<void> => {
      if (queue.length > 0 || done) return;
      await new Promise<void>(resolve => waiters.push(resolve));
    };

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: stdinText ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    this.process = child;

    if (stdinText && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }

    child.stdout!.setEncoding('utf-8');
    child.stderr!.setEncoding('utf-8');
    child.stdout!.on('data', chunk => {
      const text = String(chunk);
      stdout += text;
      if (text) push({ type: 'text', content: text });
    });
    child.stderr!.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => {
      if (this.process === child) this.process = null;
      push({ type: 'error', content: this.formatRuntimeError(error) });
      done = true;
      wake();
    });
    child.on('close', (code, signal) => {
      if (this.process === child) this.process = null;
      if (code === 0) {
        if (!stdout.trim() && stderr.trim()) push({ type: 'notice', content: stderr.trim(), level: 'warning' });
      } else {
        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n\n');
        push({ type: 'error', content: details || `Freebuff CLI exited with code ${code ?? signal ?? 'unknown'}.` });
      }
      done = true;
      wake();
    });

    while (!done || queue.length > 0) {
      await waitForChunk();
      while (queue.length > 0) {
        const chunk = queue.shift();
        if (chunk) yield chunk;
      }
    }
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) return;
    this.ready = ready;
    for (const listener of this.readyListeners) listener(ready);
  }

  private formatRuntimeError(error: unknown): string {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 'Freebuff CLI was not found. Install it with `npm install -g freebuff` or configure the CLI path in iClaudian settings.';
      }
      return error.message;
    }
    return 'Unknown Freebuff runtime error.';
  }
}
