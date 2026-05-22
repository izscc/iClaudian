import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  buildAcpPromptBlocks,
  buildAcpPromptText,
  buildAcpUsageInfo,
  extractAcpSessionModelState,
  extractAcpSessionModeState,
} from '../../acp';
import { COPILOT_PROVIDER_CAPABILITIES } from '../capabilities';
import type { CopilotCommandCatalog } from '../commands/CopilotCommandCatalog';
import { decodeCopilotModelId, encodeCopilotModelId, isCopilotModelSelectionId } from '../models';
import { copilotApprovalModeToAcpModeId, copilotApprovalModeToPermissionMode } from '../modes';
import { getCopilotProviderSettings, normalizeCopilotDiscoveredModels, updateCopilotProviderSettings } from '../settings';
import { type CopilotProviderState,getCopilotState } from '../types';
import { buildCopilotRuntimeEnv } from './CopilotRuntimeEnvironment';

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

export class CopilotChatRuntime implements ChatRuntime {
  readonly providerId = 'copilot' as const;

  private activeTurn: ActiveTurn | null = null;
  private approvalCallback: ApprovalCallback | null = null;
  private connection: AcpClientConnection | null = null;
  private contextUsage: AcpUsageUpdate | null = null;
  private currentLaunchKey: string | null = null;
  private currentSessionModelId: string | null = null;
  private currentSessionModeId: string | null = null;
  private currentTurnMetadata: ChatTurnMetadata = {};
  private loadedSessionId: string | null = null;
  private permissionModeSyncCallback: ((mode: string) => void) | null = null;
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
  private transport: AcpJsonRpcTransport | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  getCapabilities(): Readonly<ProviderCapabilities> { return COPILOT_PROVIDER_CAPABILITIES; }

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
      this.setSupportedCommands([]);
    }
    this.sessionId = conversation?.sessionId ?? null;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const settings = getCopilotProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    if (!settings.enabled) {
      this.setReady(false);
      return false;
    }

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const targetSessionId = this.sessionId;
    const resolvedCliPath = this.plugin.getResolvedProviderCliPath('copilot') ?? 'copilot';
    const runtimeEnv = buildCopilotRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, resolvedCliPath);
    const launchArgs = this.buildLaunchArgs();
    const nextLaunchKey = JSON.stringify({ command: resolvedCliPath, cwd, env: this.getEnvFingerprint(runtimeEnv), args: launchArgs });
    const shouldRestart = !this.process || !this.transport || !this.connection || !this.process.isAlive() || options?.force === true || this.currentLaunchKey !== nextLaunchKey;

    if (shouldRestart) {
      await this.shutdownProcess();
      await this.startProcess({ command: resolvedCliPath, args: launchArgs, cwd, runtimeEnv });
      this.currentLaunchKey = nextLaunchKey;
      this.loadedSessionId = null;
    }

    if (targetSessionId) {
      if (this.loadedSessionId !== targetSessionId) {
        const loaded = await this.loadSession(targetSessionId, cwd);
        if (!loaded) {
          this.sessionInvalidated = true;
          this.clearActiveSession();
        }
      }
      return true;
    }

    if (!this.sessionId && !this.sessionInvalidated) {
      if (options?.allowSessionCreation === false) return true;
      return Boolean(await this.createSession(cwd));
    }

    return true;
  }

  async *query(turn: PreparedChatTurn, conversationHistory?: ChatMessage[], queryOptions?: ChatRuntimeQueryOptions): AsyncGenerator<StreamChunk> {
    const previousMessages = conversationHistory ?? [];
    const expectedSessionId = this.sessionId;
    let shouldBootstrapHistory = previousMessages.length > 0 && (!expectedSessionId || this.sessionInvalidated);

    if (!(await this.ensureReady())) {
      yield { type: 'error', content: 'Failed to start Copilot. Check the CLI path and login state.' };
      yield { type: 'done' };
      return;
    }
    if (!this.connection) {
      yield { type: 'error', content: 'Copilot runtime is not ready.' };
      yield { type: 'done' };
      return;
    }

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    if (expectedSessionId && !this.sessionId) shouldBootstrapHistory = previousMessages.length > 0;
    if (!this.sessionId) {
      const sessionId = await this.createSession(cwd);
      if (!sessionId) {
        yield { type: 'error', content: 'Failed to create a Copilot session.' };
        yield { type: 'done' };
        return;
      }
    }

    const sessionId = this.sessionId!;
    this.activeTurn?.queue.close();
    this.activeTurn = { queue: new StreamChunkQueue(), sessionId };
    this.currentTurnMetadata = {};
    this.contextUsage = null;
    this.promptUsage = null;
    this.sessionUpdateNormalizer.reset();
    const activeTurn = this.activeTurn;

    try {
      await this.applySelectedMode(sessionId);
      await this.applySelectedModel(sessionId, queryOptions);
    } catch (error) {
      yield { type: 'error', content: this.formatRuntimeError(error) };
      yield { type: 'done' };
      activeTurn.queue.close();
      this.activeTurn = null;
      return;
    }

    const promptPromise = this.connection.prompt({
      prompt: buildAcpPromptBlocks(
        turn.request,
        shouldBootstrapHistory ? previousMessages : [],
      ),
      sessionId,
    })
      .then((response) => {
        if (response.userMessageId) this.currentTurnMetadata.userMessageId = response.userMessageId;
        this.promptUsage = response.usage ?? null;
        const usage = buildAcpUsageInfo({ contextWindow: this.contextUsage, model: this.getActiveDisplayModel(queryOptions), promptUsage: this.promptUsage });
        if (usage) activeTurn.queue.push({ sessionId, type: 'usage', usage });
        activeTurn.queue.push({ type: 'done' });
        activeTurn.queue.close();
      })
      .catch((error) => {
        activeTurn.queue.push({ type: 'error', content: this.formatRuntimeError(error) });
        activeTurn.queue.push({ type: 'done' });
        activeTurn.queue.close();
      })
      .finally(() => { if (this.activeTurn === activeTurn) this.activeTurn = null; });

    try {
      while (true) {
        const chunk = await activeTurn.queue.next();
        if (!chunk) break;
        yield chunk;
      }
      await promptPromise;
    } finally {
      if (this.activeTurn === activeTurn) this.activeTurn = null;
    }
  }

  cancel(): void {
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
    const state = params.conversation ? getCopilotState(params.conversation.providerState) : {};
    const providerState: CopilotProviderState = { ...(state.sessionCwd ? { sessionCwd: state.sessionCwd } : {}) };
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
    await this.connection.initialize();
    this.setReady(true);
  }

  private async shutdownProcess(): Promise<void> {
    this.setReady(false);
    this.activeTurn?.queue.close();
    this.activeTurn = null;
    this.currentSessionModelId = null;
    this.currentSessionModeId = null;
    this.setSupportedCommands([]);
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
    return Object.entries(env)
      .filter(([key, value]) => /^(COPILOT_|GITHUB_|GH_)/i.test(key) && typeof value === 'string' && value)
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('|');
  }


  private buildLaunchArgs(): string[] {
    const settings = getCopilotProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    const args = ['--acp', '--stdio'];
    const rawModelId = this.resolveSelectedRawModelId();
    if (rawModelId) args.push('--model', rawModelId);

    const effortLevel = typeof this.plugin.settings.effortLevel === 'string'
      ? this.plugin.settings.effortLevel
      : '';
    if (['low', 'medium', 'high', 'xhigh', 'max'].includes(effortLevel)) {
      args.push('--effort', effortLevel);
    }

    if (settings.selectedApprovalMode === 'plan') {
      args.push('--mode', 'plan');
    } else if (settings.selectedApprovalMode === 'yolo') {
      args.push('--mode', 'autopilot', '--autopilot', '--allow-all');
    }

    if (settings.autopilot && settings.selectedApprovalMode === 'default') args.push('--autopilot');
    if (settings.experimental) args.push('--experimental');
    if (settings.remote) args.push('--remote');
    else args.push('--no-remote');
    if (settings.enableReasoningSummaries) args.push('--enable-reasoning-summaries');
    if (settings.customAgent) args.push('--agent', settings.customAgent);

    appendRepeatedArgs(args, '--additional-mcp-config', settings.additionalMcpConfig);
    appendRepeatedArgs(args, '--add-github-mcp-tool', settings.githubMcpTools);
    appendRepeatedArgs(args, '--add-github-mcp-toolset', settings.githubMcpToolsets);
    appendRepeatedArgs(args, '--allow-tool', settings.allowTools);
    appendRepeatedArgs(args, '--deny-tool', settings.denyTools);
    appendRepeatedArgs(args, '--available-tools', settings.availableTools);
    appendRepeatedArgs(args, '--allow-url', settings.allowUrls);
    appendRepeatedArgs(args, '--deny-url', settings.denyUrls);

    return args;
  }

  private resolveSelectedApprovalMode(): string {
    const providerSettings = getCopilotProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    return providerSettings.selectedApprovalMode;
  }

  private resolveSelectedRawModelId(queryOptions?: ChatRuntimeQueryOptions): string | null {
    const selectedModel = typeof queryOptions?.model === 'string'
      ? queryOptions.model
      : typeof this.plugin.settings.model === 'string'
      ? this.plugin.settings.model
      : '';
    if (!selectedModel || !isCopilotModelSelectionId(selectedModel)) return null;
    return decodeCopilotModelId(selectedModel);
  }

  private getActiveDisplayModel(queryOptions?: ChatRuntimeQueryOptions): string | undefined {
    const raw = this.resolveSelectedRawModelId(queryOptions) ?? this.currentSessionModelId;
    return raw ? encodeCopilotModelId(raw) : undefined;
  }

  private async applySelectedMode(sessionId: string): Promise<void> {
    if (!this.connection) return;
    const selected = getCopilotProviderSettings(this.plugin.settings as unknown as Record<string, unknown>).selectedApprovalMode;
    const modeId = copilotApprovalModeToAcpModeId(selected);
    if (!modeId || modeId === this.currentSessionModeId) return;
    try {
      await this.connection.setMode({ modeId, sessionId });
      this.currentSessionModeId = modeId;
      this.emitPermissionModeSync(modeId);
    } catch {
      // Copilot CLI also accepts initial --mode/--allow-all flags. Some ACP builds
      // do not expose runtime mode switching, so keep the current turn running.
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
      // Copilot CLI ACP may expose its model catalog but not implement
      // session/set_config_option. The selected model is still applied at process launch
      // with --model when it comes from persisted settings, so ignore per-turn switches.
    }
  }

  private async syncSessionModelState(params: { configOptions?: AcpSessionConfigOption[] | null; models?: AcpSessionModelState | null }): Promise<void> {
    const acpState = extractAcpSessionModelState(params);
    const models = normalizeCopilotDiscoveredModels(acpState.availableModels.map(model => ({ rawId: model.id, label: model.name, description: model.description ?? undefined })));
    if (acpState.currentModelId) this.currentSessionModelId = acpState.currentModelId;
    const settingsBag = this.plugin.settings as unknown as Record<string, unknown>;
    const current = getCopilotProviderSettings(settingsBag);
    const modelChanged = JSON.stringify(current.discoveredModels) !== JSON.stringify(models) && models.length > 0;
    const shouldSeedVisible = current.visibleModels.length === 0 && acpState.currentModelId;
    if (!modelChanged && !shouldSeedVisible) return;
    updateCopilotProviderSettings(settingsBag, {
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
    const permissionMode = copilotApprovalModeToPermissionMode(mode);
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
    if (normalized.type === 'commands') { this.setSupportedCommands(normalized.commands); CopilotChatRuntime.commandCatalog?.setRuntimeCommands(normalized.commands); return; }
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

  static commandCatalog: CopilotCommandCatalog | null = null;

  private async handlePermissionRequest(request: AcpRequestPermissionRequest): Promise<AcpRequestPermissionResponse> {
    if (!this.approvalCallback) return { outcome: { outcome: 'cancelled' } };
    const input = normalizeApprovalInput(request.toolCall.rawInput);
    const toolName = request.toolCall.title?.trim() || request.toolCall.kind || 'tool';
    const decision = await this.approvalCallback(toolName, input, `Copilot wants permission to use ${toolName}.`, { decisionOptions: buildApprovalOptions(request.options) });
    return mapApprovalDecision(decision, request.options);
  }

  private setSupportedCommands(commands: SlashCommand[]): void {
    this.supportedCommands = commands.map(command => ({ ...command }));
    CopilotChatRuntime.commandCatalog?.setRuntimeCommands(this.supportedCommands);
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
    const resolvedPath = this.resolveSessionPath(request.sessionId, request.path);
    const content = await fs.readFile(resolvedPath, 'utf-8');
    if (request.line === undefined && request.limit === undefined) return { content };
    const lines = content.split(/\r?\n/);
    const startIndex = Math.max(0, (request.line ?? 1) - 1);
    const endIndex = request.limit ? startIndex + Math.max(0, request.limit) : lines.length;
    return { content: lines.slice(startIndex, endIndex).join('\n') };
  }

  private async writeTextFile(request: AcpWriteTextFileRequest): Promise<Record<string, never>> {
    const resolvedPath = this.resolveSessionPath(request.sessionId, request.path);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, request.content, 'utf-8');
    return {};
  }

  private resolveSessionPath(sessionId: string, rawPath: string): string {
    const normalizedPath = normalizeAcpFilePath(rawPath);
    if (path.isAbsolute(normalizedPath)) return normalizedPath;
    const cwd = this.sessionCwds.get(sessionId) ?? getVaultPath(this.plugin.app) ?? process.cwd();
    return path.resolve(cwd, normalizedPath);
  }

  private formatRuntimeError(error: unknown): string {
    const baseMessage = error instanceof Error ? error.message : 'Copilot request failed';
    const stderr = this.process?.getStderrSnapshot();
    return stderr ? `${baseMessage}\n\n${stderr}` : baseMessage;
  }

  private clearActiveSession(): void {
    this.sessionId = null;
    this.loadedSessionId = null;
    this.currentSessionModelId = null;
    this.currentSessionModeId = null;
    this.setSupportedCommands([]);
  }
}


function normalizeAcpFilePath(rawPath: string): string {
  if (!rawPath.startsWith('file://')) return rawPath;
  try {
    return fileURLToPath(rawPath);
  } catch {
    return rawPath;
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

function splitCliList(value: string): string[] {
  return value
    .split(/[\r\n,]+/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function appendRepeatedArgs(args: string[], flag: string, value: string): void {
  for (const entry of splitCliList(value)) {
    args.push(flag, entry);
  }
}
