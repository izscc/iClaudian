import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ProviderCapabilities } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnResult,
  ChatRewindResult,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  PreparedChatTurn,
  SessionUpdateResult,
  SubagentRuntimeState,
} from '../../../core/runtime/types';
import type { ApprovalDecision, ChatMessage, Conversation, ExitPlanModeCallback, SlashCommand, StreamChunk, ToolCallInfo } from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import {
  AcpClientConnection,
  AcpJsonRpcTransport,
  type AcpReadTextFileRequest,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionConfigOption,
  type AcpSessionModelState,
  type AcpSessionModeState,
  type AcpSessionNotification,
  AcpSessionUpdateNormalizer,
  AcpSubprocess,
  type AcpUsage,
  type AcpUsageUpdate,
  type AcpWriteTextFileRequest,
  buildAcpPromptText,
  buildAcpUsageInfo,
  extractAcpSessionModelState,
  extractAcpSessionModeState,
  readAcpTextFile,
} from '../../acp';
import { ANTIGRAVITY_PROVIDER_CAPABILITIES } from '../capabilities';
import type { AntigravityCommandCatalog } from '../commands/AntigravityCommandCatalog';
import { decodeAntigravityModelId, encodeAntigravityModelId, isAntigravityModelSelectionId } from '../models';
import { antigravityApprovalModeToAcpModeId, antigravityApprovalModeToPermissionMode } from '../modes';
import { getAntigravityProviderSettings, normalizeAntigravityDiscoveredModels, updateAntigravityProviderSettings } from '../settings';
import { type AntigravityProviderState,getAntigravityState } from '../types';
import { buildAntigravityRuntimeEnv } from './AntigravityRuntimeEnvironment';

const ANTIGRAVITY_ACP_INITIALIZE_TIMEOUT_MS = 120_000;

interface ActiveTurn { queue: StreamChunkQueue; sessionId: string }

class StreamChunkQueue {
  private closed = false;
  private readonly items: StreamChunk[] = [];
  private readonly waiters: Array<(chunk: StreamChunk | null) => void> = [];
  push(chunk: StreamChunk): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(chunk); else this.items.push(chunk);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length) this.waiters.shift()?.(null);
  }
  async next(): Promise<StreamChunk | null> {
    if (this.items.length) return this.items.shift() ?? null;
    if (this.closed) return null;
    return new Promise(resolve => this.waiters.push(resolve));
  }
}

export class AntigravityChatRuntime implements ChatRuntime {
  readonly providerId = 'antigravity' as const;

  private activeTurn: ActiveTurn | null = null;
  private approvalCallback: ApprovalCallback | null = null;
  private connection: AcpClientConnection | null = null;
  private contextUsage: AcpUsageUpdate | null = null;
  private currentLaunchKey: string | null = null;
  private currentSessionModelId: string | null = null;
  private currentSessionModeId: string | null = null;
  private currentTurnMetadata: ChatTurnMetadata = {};
  private loadedSessionId: string | null = null;
  private hasNativeContinuation = false;
  private permissionModeSyncCallback: ((mode: string) => void) | null = null;
  private printProcess: ChildProcess | null = null;
  private process: AcpSubprocess | null = null;
  private promptUsage: AcpUsage | null = null;
  private readonly readyListeners: Array<(ready: boolean) => void> = [];
  private ready = false;
  private sessionInvalidated = false;
  private readonly supportedCommandWaiters: Array<(commands: SlashCommand[]) => void> = [];
  private supportedCommands: SlashCommand[] = [];
  private sessionCwds = new Map<string, string>();
  private sessionId: string | null = null;
  private readonly sessionUpdateNormalizer = new AcpSessionUpdateNormalizer();
  private stdoutBuffer = '';
  private transport: AcpJsonRpcTransport | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  getCapabilities(): Readonly<ProviderCapabilities> { return ANTIGRAVITY_PROVIDER_CAPABILITIES; }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return {
      isCompact: false,
      mcpMentions: request.enabledMcpServers ?? new Set(),
      persistedContent: '',
      prompt: buildAcpPromptText(request),
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

  syncConversationState(conversation: { providerState?: Record<string, unknown>; sessionId?: string | null } | null): void {
    if (this.sessionId !== (conversation?.sessionId ?? null)) {
      this.currentSessionModelId = null;
      this.currentSessionModeId = null;
      this.sessionInvalidated = false;
      this.hasNativeContinuation = false;
      this.setSupportedCommands([]);
    }
    this.sessionId = conversation?.sessionId ?? null;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const settings = getAntigravityProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    if (!settings.enabled) {
      this.setReady(false);
      return false;
    }

    // No writes here: ensureReady also runs for blank-tab prewarm, and warmup must not
    // touch the agy settings file under ~/.gemini. queryPrintMode persists the model
    // right before each spawn.
    await this.shutdownProcess();
    if (!this.sessionId) this.sessionId = `antigravity-${Date.now()}`;
    this.loadedSessionId = this.sessionId;
    this.setReady(true);
    return true;
  }

  async *query(turn: PreparedChatTurn, conversationHistory?: ChatMessage[], queryOptions?: ChatRuntimeQueryOptions): AsyncGenerator<StreamChunk> {
    const previousMessages = conversationHistory ?? [];
    if (!(await this.ensureReady())) {
      yield { type: 'error', content: 'Failed to start Antigravity. Check the CLI path and login state.' };
      yield { type: 'done' };
      return;
    }

    yield* this.queryPrintMode(turn, previousMessages, queryOptions);
  }

  cancel(): void {
    this.printProcess?.kill('SIGTERM');
    this.printProcess = null;
    if (this.connection && this.sessionId) this.connection.cancel({ sessionId: this.sessionId });
    this.activeTurn?.queue.close();
  }
  resetSession(): void { this.clearActiveSession(); this.sessionInvalidated = false; }
  getSessionId(): string | null { return this.sessionId; }
  consumeSessionInvalidation(): boolean { const v = this.sessionInvalidated; this.sessionInvalidated = false; return v; }
  isReady(): boolean { return this.ready; }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    if (this.supportedCommands.length > 0 && this.loadedSessionId === this.sessionId) return [...this.supportedCommands];
    if (this.sessionId && this.loadedSessionId !== this.sessionId) {
      const ready = await this.ensureReady({ allowSessionCreation: false });
      if (!ready) return [];
    }
    if (!this.sessionId) return [];
    if (this.supportedCommands.length > 0) return [...this.supportedCommands];
    return this.waitForSupportedCommands();
  }

  cleanup(): void { this.activeTurn?.queue.close(); void this.shutdownProcess(); }
  async rewind(): Promise<ChatRewindResult> { return { canRewind: false }; }
  setApprovalCallback(callback: ApprovalCallback | null): void { this.approvalCallback = callback; }
  setApprovalDismisser(_dismisser: (() => void) | null): void {}
  setAskUserQuestionCallback(_callback: AskUserQuestionCallback | null): void {}
  setExitPlanModeCallback(_callback: ExitPlanModeCallback | null): void {}
  setPermissionModeSyncCallback(callback: ((sdkMode: string) => void) | null): void { this.permissionModeSyncCallback = callback; }
  setSubagentHookProvider(_getState: () => SubagentRuntimeState): void {}
  setAutoTurnCallback(_callback: ((result: AutoTurnResult) => void) | null): void {}
  consumeTurnMetadata(): ChatTurnMetadata { const metadata = this.currentTurnMetadata; this.currentTurnMetadata = {}; return metadata; }

  buildSessionUpdates(params: { conversation: Conversation | null; sessionInvalidated: boolean }): SessionUpdateResult {
    const state = params.conversation ? getAntigravityState(params.conversation.providerState) : {};
    const providerState: AntigravityProviderState = { ...(state.sessionCwd ? { sessionCwd: state.sessionCwd } : {}) };
    return {
      updates: {
        providerState: Object.keys(providerState).length > 0 ? providerState as Record<string, unknown> : undefined,
        sessionId: params.sessionInvalidated && !this.sessionId ? null : this.sessionId,
      },
    };
  }

  resolveSessionIdForFork(conversation: Conversation | null): string | null { return this.sessionId ?? conversation?.sessionId ?? null; }
  async loadSubagentToolCalls(): Promise<ToolCallInfo[]> { return []; }
  async loadSubagentFinalResult(): Promise<string | null> { return null; }

  private async startProcess(params: { command: string; args: string[]; cwd: string; runtimeEnv: NodeJS.ProcessEnv }): Promise<void> {
    this.process = new AcpSubprocess({ args: params.args, command: params.command, cwd: params.cwd, env: { ...process.env, ...params.runtimeEnv } });
    this.process.start();

    // Capture stdout for debugging and authentication messages
    this.stdoutBuffer = '';
    this.process.stdout.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      this.stdoutBuffer = `${this.stdoutBuffer}${text}`.slice(-8000);
    });

    this.transport = new AcpJsonRpcTransport({ input: this.process.stdout, onClose: (listener) => this.process!.onClose(listener), output: this.process.stdin });
    this.connection = new AcpClientConnection({
      clientInfo: { name: 'iclaudian', version: this.plugin.manifest?.version ?? '0.0.0' },
      delegate: {
        fileSystem: { readTextFile: (request) => this.readTextFile(request), writeTextFile: (request) => this.writeTextFile(request) },
        onSessionNotification: (notification) => this.handleSessionNotification(notification),
        requestPermission: (request) => this.handlePermissionRequest(request),
      },
      transport: this.transport,
    });
    this.transport.start();
    try {
      await this.connection.initialize({}, { timeoutMs: ANTIGRAVITY_ACP_INITIALIZE_TIMEOUT_MS });
      this.setReady(true);
    } catch (error) {
      const formatted = this.formatRuntimeError(error);
      await this.shutdownProcess();
      throw new Error(
        formatted,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  }

  private async shutdownProcess(): Promise<void> {
    this.setReady(false);
    this.activeTurn?.queue.close();
    this.activeTurn = null;
    this.currentSessionModelId = null;
    this.currentSessionModeId = null;
    this.setSupportedCommands([]);
    this.printProcess?.kill('SIGTERM');
    this.printProcess = null;
    this.connection?.dispose(); this.connection = null;
    this.transport?.dispose(); this.transport = null;
    if (this.process) { await this.process.shutdown().catch(() => {}); this.process = null; }
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) return;
    this.ready = ready;
    for (const listener of this.readyListeners) listener(ready);
  }

  private getEnvFingerprint(env: NodeJS.ProcessEnv): string {
    return ['ANTIGRAVITY_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI']
      .filter(key => typeof env[key] === 'string' && env[key])
      .map(key => `${key}=${env[key]}`)
      .sort()
      .join('|');
  }

  private resolveSelectedApprovalMode(): string {
    const providerSettings = getAntigravityProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    return providerSettings.selectedApprovalMode;
  }

  private resolveSelectedRawModelId(queryOptions?: ChatRuntimeQueryOptions): string | null {
    const selectedModel = typeof queryOptions?.model === 'string'
      ? queryOptions.model
      : typeof this.plugin.settings.model === 'string'
      ? this.plugin.settings.model
      : '';
    if (!selectedModel || !isAntigravityModelSelectionId(selectedModel)) return null;
    return decodeAntigravityModelId(selectedModel);
  }

  private getActiveDisplayModel(queryOptions?: ChatRuntimeQueryOptions): string | undefined {
    const raw = this.resolveSelectedRawModelId(queryOptions) ?? this.currentSessionModelId;
    return raw ? encodeAntigravityModelId(raw) : undefined;
  }

  private buildPrintPrompt(turn: PreparedChatTurn, previousMessages: ChatMessage[], useNativeContinuation: boolean): string {
    if (useNativeContinuation || !previousMessages.length) return turn.prompt;
    const history = previousMessages.slice(-12).map((message) => {
      const role = message.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${message.content}`;
    }).join('\n\n');
    return `Continue the existing conversation below.\n\n${history}\n\nUser: ${turn.prompt}`;
  }

  private async *queryPrintMode(
    turn: PreparedChatTurn,
    previousMessages: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    const command = this.plugin.getResolvedProviderCliPath('antigravity') ?? 'agy';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const runtimeEnv = buildAntigravityRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, command);
    const selectedModel = this.resolveSelectedRawModelId(queryOptions);
    const useNativeContinuation = this.hasNativeContinuation && previousMessages.length > 0 && !this.sessionInvalidated;
    try {
      await this.persistSelectedModel(selectedModel);
      yield* this.runPrintStream({
        command,
        cwd,
        env: { ...process.env, ...runtimeEnv },
        continueConversation: useNativeContinuation,
        prompt: this.buildPrintPrompt(turn, previousMessages, useNativeContinuation),
        skipPermissions: getAntigravityProviderSettings(this.plugin.settings as unknown as Record<string, unknown>).selectedApprovalMode === 'yolo',
      });
    } catch (error) {
      yield { type: 'error', content: this.formatRuntimeError(error) };
    }
    yield { type: 'done' };
  }

  private async persistSelectedModel(model: string | null): Promise<void> {
    if (!model) return;
    const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (parsed.model === model) return;
    parsed.model = model;
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
  }

  private async *runPrintStream(params: {
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    continueConversation: boolean;
    prompt: string;
    skipPermissions: boolean;
  }): AsyncGenerator<StreamChunk> {
    const args = [
      ...(params.skipPermissions ? ['--dangerously-skip-permissions'] : []),
      ...(params.continueConversation ? ['--continue'] : []),
      '--print',
      params.prompt,
      '--print-timeout',
      '5m',
    ];

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

    const child = spawn(params.command, args, {
      cwd: params.cwd,
      env: params.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.printProcess = child;
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => {
      const text = String(chunk);
      stdout += text;
      if (text) push({ type: 'text', content: text });
    });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => {
      if (this.printProcess === child) this.printProcess = null;
      push({ type: 'error', content: this.formatRuntimeError(error) });
      done = true;
      wake();
    });
    child.on('close', (code, signal) => {
      if (this.printProcess === child) this.printProcess = null;
      if (code === 0) {
        this.hasNativeContinuation = true;
        if (!stdout.trim() && stderr.trim()) push({ type: 'notice', content: stderr.trim(), level: 'warning' });
      } else {
        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n\n');
        push({ type: 'error', content: details || `Antigravity CLI exited with code ${code ?? signal ?? 'unknown'}.` });
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


  private async applySelectedMode(sessionId: string): Promise<void> {
    if (!this.connection) return;
    const settingsBag = this.plugin.settings as unknown as Record<string, unknown>;
    const selected = getAntigravityProviderSettings(settingsBag).selectedApprovalMode;
    const modeId = antigravityApprovalModeToAcpModeId(selected);
    if (!modeId || modeId === this.currentSessionModeId) return;
    try {
      await this.connection.setMode({ modeId, sessionId });
      this.currentSessionModeId = modeId;
      this.emitPermissionModeSync(modeId);
    } catch {
      const response = await this.connection.setConfigOption({ configId: 'mode', sessionId, type: 'select', value: modeId });
      await this.syncSessionModeState({ configOptions: response.configOptions });
    }
  }

  private async applySelectedModel(sessionId: string, queryOptions?: ChatRuntimeQueryOptions): Promise<void> {
    if (!this.connection) return;
    const rawModelId = this.resolveSelectedRawModelId(queryOptions);
    if (!rawModelId || rawModelId === this.currentSessionModelId) return;
    try {
      const response = await this.connection.setConfigOption({ configId: 'model', sessionId, type: 'select', value: rawModelId });
      this.currentSessionModelId = rawModelId;
      await this.syncSessionModelState({ configOptions: response.configOptions });
    } catch {
      // Antigravity CLI 0.40 exposes its model catalog over ACP but does not yet implement
      // session/set_config_option. The selected model is still applied at process launch
      // with --model when it comes from persisted settings, so ignore per-turn switches.
    }
  }

  private async syncSessionModelState(params: { configOptions?: AcpSessionConfigOption[] | null; models?: AcpSessionModelState | null }): Promise<void> {
    const acpState = extractAcpSessionModelState(params);
    const models = normalizeAntigravityDiscoveredModels(acpState.availableModels.map(model => ({ rawId: model.id, label: model.name, description: model.description ?? undefined })));
    if (acpState.currentModelId) this.currentSessionModelId = acpState.currentModelId;
    const settingsBag = this.plugin.settings as unknown as Record<string, unknown>;
    const current = getAntigravityProviderSettings(settingsBag);
    const modelChanged = JSON.stringify(current.discoveredModels) !== JSON.stringify(models) && models.length > 0;
    const shouldSeedVisible = current.visibleModels.length === 0 && acpState.currentModelId;
    if (!modelChanged && !shouldSeedVisible) return;
    updateAntigravityProviderSettings(settingsBag, {
      ...(modelChanged ? { discoveredModels: models } : {}),
      ...(shouldSeedVisible && acpState.currentModelId ? { visibleModels: [acpState.currentModelId] } : {}),
    });
    await this.plugin.saveSettings();
    this.refreshModelSelectors();
  }

  private async syncSessionModeState(params: { configOptions?: AcpSessionConfigOption[] | null; currentModeId?: string | null; modes?: AcpSessionModeState | null }): Promise<void> {
    const acpState = extractAcpSessionModeState(params);
    const currentModeId = params.currentModeId ?? acpState.currentModeId;
    if (currentModeId) {
      this.currentSessionModeId = currentModeId;
      this.emitPermissionModeSync(currentModeId);
    }
  }

  private refreshModelSelectors(): void { for (const view of this.plugin.getAllViews()) view.refreshModelSelector(); }

  private emitPermissionModeSync(modeId: string): void {
    const mode = modeId === 'autoEdit' ? 'auto_edit' : modeId;
    const permissionMode = antigravityApprovalModeToPermissionMode(mode);
    try {
      this.permissionModeSyncCallback?.(permissionMode);
    } catch {
      // Best-effort UI sync; ignore callback failures.
    }
  }

  private async createSession(cwd: string): Promise<string | null> {
    if (!this.connection) return null;
    try {
      this.setSupportedCommands([]);
      const response = await this.connection.newSession({ cwd, mcpServers: [] });
      this.loadedSessionId = response.sessionId;
      this.sessionId = response.sessionId;
      this.sessionCwds.set(response.sessionId, cwd);
      await this.syncSessionModelState({ configOptions: response.configOptions ?? null, models: response.models ?? null });
      await this.syncSessionModeState({ configOptions: response.configOptions ?? null, modes: response.modes ?? null });
      return response.sessionId;
    } catch { return null; }
  }

  private async loadSession(sessionId: string, cwd: string): Promise<boolean> {
    if (!this.connection) return false;
    try {
      this.setSupportedCommands([]);
      const response = await this.connection.loadSession({ cwd, mcpServers: [], sessionId });
      this.sessionInvalidated = false;
      this.loadedSessionId = response.sessionId;
      this.sessionId = response.sessionId;
      this.sessionCwds.set(response.sessionId, cwd);
      await this.syncSessionModelState({ configOptions: response.configOptions ?? null, models: response.models ?? null });
      await this.syncSessionModeState({ configOptions: response.configOptions ?? null, modes: response.modes ?? null });
      return true;
    } catch { return false; }
  }

  private async handleSessionNotification(notification: AcpSessionNotification): Promise<void> {
    if (notification.sessionId !== this.sessionId) return;
    const normalized = this.sessionUpdateNormalizer.normalize(notification.update);
    if (normalized.type === 'config_options') {
      await this.syncSessionModelState({ configOptions: normalized.configOptions });
      await this.syncSessionModeState({ configOptions: normalized.configOptions });
      return;
    }
    if (normalized.type === 'current_mode') { await this.syncSessionModeState({ currentModeId: normalized.currentModeId }); return; }
    if (normalized.type === 'commands') { this.setSupportedCommands(normalized.commands); AntigravityChatRuntime.commandCatalog?.setRuntimeCommands(normalized.commands); return; }
    if (!this.activeTurn || this.activeTurn.sessionId !== notification.sessionId) return;
    switch (normalized.type) {
      case 'message_chunk':
        if (normalized.role === 'assistant' && normalized.messageId) this.currentTurnMetadata.assistantMessageId = normalized.messageId;
        if (normalized.role === 'user' && normalized.messageId) this.currentTurnMetadata.userMessageId = normalized.messageId;
        for (const chunk of normalized.streamChunks) this.activeTurn.queue.push(chunk);
        return;
      case 'tool_call':
      case 'tool_call_update':
        for (const chunk of normalized.streamChunks) this.activeTurn.queue.push(chunk);
        return;
      case 'usage': {
        this.contextUsage = normalized.usage;
        const usage = buildAcpUsageInfo({ contextWindow: normalized.usage, model: this.getActiveDisplayModel(), promptUsage: this.promptUsage });
        if (usage) this.activeTurn.queue.push({ sessionId: notification.sessionId, type: 'usage', usage });
        return;
      }
      default:
        return;
    }
  }

  static commandCatalog: AntigravityCommandCatalog | null = null;

  private async handlePermissionRequest(request: AcpRequestPermissionRequest): Promise<AcpRequestPermissionResponse> {
    if (!this.approvalCallback) return { outcome: { outcome: 'cancelled' } };
    const input = normalizeApprovalInput(request.toolCall.rawInput);
    const toolName = request.toolCall.title?.trim() || request.toolCall.kind || 'tool';
    const decision = await this.approvalCallback(toolName, input, `Antigravity wants permission to use ${toolName}.`, { decisionOptions: buildApprovalOptions(request.options) });
    return mapApprovalDecision(decision, request.options);
  }

  private setSupportedCommands(commands: SlashCommand[]): void {
    this.supportedCommands = commands.map(command => ({ ...command }));
    AntigravityChatRuntime.commandCatalog?.setRuntimeCommands(this.supportedCommands);
    const waiters = this.supportedCommandWaiters.splice(0);
    for (const waiter of waiters) waiter(this.supportedCommands);
  }

  private waitForSupportedCommands(timeoutMs = 250): Promise<SlashCommand[]> {
    if (this.supportedCommands.length > 0) return Promise.resolve([...this.supportedCommands]);
    return new Promise(resolve => {
      const waiter = (commands: SlashCommand[]) => { clearTimeout(timeoutId); resolve([...commands]); };
      const timeoutId = setTimeout(() => {
        const index = this.supportedCommandWaiters.indexOf(waiter);
        if (index >= 0) this.supportedCommandWaiters.splice(index, 1);
        resolve([...this.supportedCommands]);
      }, timeoutMs);
      this.supportedCommandWaiters.push(waiter);
    });
  }

  private async readTextFile(request: AcpReadTextFileRequest): Promise<{ content: string }> {
    return readAcpTextFile(this.resolveSessionPath(request.sessionId, request.path), request);
  }

  private async writeTextFile(request: AcpWriteTextFileRequest): Promise<Record<string, never>> {
    const resolvedPath = this.resolveSessionPath(request.sessionId, request.path);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, request.content, 'utf-8');
    return {};
  }

  private resolveSessionPath(sessionId: string, rawPath: string): string {
    if (path.isAbsolute(rawPath)) return rawPath;
    const cwd = this.sessionCwds.get(sessionId) ?? getVaultPath(this.plugin.app) ?? process.cwd();
    return path.resolve(cwd, rawPath);
  }

  private formatRuntimeError(error: unknown): string {
    const baseMessage = error instanceof Error ? error.message : 'Antigravity request failed';
    const stderr = this.process?.getStderrSnapshot();
    const stdout = this.stdoutBuffer.trim();
    
    let message = baseMessage;
    if (stdout) {
      message += `\n\n[STDOUT]\n${stdout}`;
    }
    if (stderr) {
      message += `\n\n[STDERR]\n${stderr}`;
    }
    return message;
  }

  private clearActiveSession(): void {
    this.sessionId = null;
    this.loadedSessionId = null;
    this.currentSessionModelId = null;
    this.currentSessionModeId = null;
    this.hasNativeContinuation = false;
    this.setSupportedCommands([]);
  }
}

function normalizeApprovalInput(rawInput: unknown): Record<string, unknown> {
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) return rawInput as Record<string, unknown>;
  if (rawInput === undefined) return {};
  return { value: rawInput };
}

function buildApprovalOptions(options: readonly { kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'; name: string; optionId: string }[]) {
  return options.map((option) => ({
    ...(option.kind === 'allow_once' ? { decision: 'allow' as const } : option.kind === 'allow_always' ? { decision: 'allow-always' as const } : {}),
    label: option.name,
    value: option.optionId,
  }));
}

function mapApprovalDecision(
  decision: ApprovalDecision,
  options: readonly { kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'; optionId: string }[],
): AcpRequestPermissionResponse {
  if (decision === 'allow') return selectPermissionOption(options, ['allow_once', 'allow_always']);
  if (decision === 'allow-always') return selectPermissionOption(options, ['allow_always', 'allow_once']);
  if (decision === 'deny') return selectPermissionOption(options, ['reject_once', 'reject_always']);
  if (typeof decision === 'object' && decision.type === 'select-option') return { outcome: { optionId: decision.value, outcome: 'selected' } };
  return { outcome: { outcome: 'cancelled' } };
}

function selectPermissionOption(
  options: readonly { kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'; optionId: string }[],
  preferredKinds: readonly ('allow_once' | 'allow_always' | 'reject_once' | 'reject_always')[],
): AcpRequestPermissionResponse {
  for (const kind of preferredKinds) {
    const option = options.find(entry => entry.kind === kind);
    if (option) return { outcome: { optionId: option.optionId, outcome: 'selected' } };
  }
  return { outcome: { outcome: 'cancelled' } };
}
