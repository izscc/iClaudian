import { type ChildProcess, spawn } from 'node:child_process';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { FreebuffChatStateWatcher } from './FreebuffChatStateWatcher';
import { buildFreebuffCliInvocation } from './FreebuffCliInvocation';
import { persistFreebuffModelSelection } from './FreebuffModelSettings';
import { hasFreebuffTerminalControl, sanitizeFreebuffProcessOutput } from './FreebuffOutputSanitizer';
import { terminateFreebuffProcess } from './FreebuffProcessControl';
import { buildFreebuffSpawnCommand } from './FreebuffPtyBridge';
import { buildFreebuffRuntimeEnv } from './FreebuffRuntimeEnvironment';
import { FreebuffTuiAutomation } from './FreebuffTuiAutomation';

export class FreebuffAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;
  private currentProcess: ChildProcess | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const configuredCliPath = this.plugin.getResolvedProviderCliPath('freebuff');
    await persistFreebuffModelSelection(config.model);
    const invocation = buildFreebuffCliInvocation({
      configuredCliPath,
      cwd,
      prompt: config.systemPrompt ? `${config.systemPrompt}\n\n${prompt}` : prompt,
      selectedModel: config.model,
    });
    const env = buildFreebuffRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, invocation.command);

    this.currentAbortController = config.abortController ?? new AbortController();
    return await new Promise<string>((resolve, reject) => {
      const stateWatcher = new FreebuffChatStateWatcher(cwd, env);
      const spawnCommand = buildFreebuffSpawnCommand(invocation.command, invocation.args);
      const child = spawn(spawnCommand.command, spawnCommand.args, {
        cwd,
        detached: process.platform !== 'win32',
        env,
        signal: this.currentAbortController?.signal,
        stdio: invocation.stdinText ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });
      this.currentProcess = child;
      let stdout = '';
      let stderr = '';
      let terminalOutputDetected = false;
      let settled = false;
      let pollTimer: NodeJS.Timeout | null = null;
      let nextPromptAttemptAt = Date.now() + 16_000;
      const cleanup = (): void => {
        if (this.currentProcess === child) this.currentProcess = null;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
      const maybeRetryPromptSubmission = (tuiAutomation: FreebuffTuiAutomation | null): void => {
        if (!tuiAutomation || stateWatcher.hasPromptStarted() || Date.now() < nextPromptAttemptAt) return;
        tuiAutomation.sendPrompt(true);
        nextPromptAttemptAt = Date.now() + 8_000;
      };
      const resolveFromState = (tuiAutomation: FreebuffTuiAutomation | null): void => {
        maybeRetryPromptSubmission(tuiAutomation);
        if (settled) return;
        const response = stateWatcher.readAssistantResponse();
        if (!response) return;
        settled = true;
        cleanup();
        terminateFreebuffProcess(child, 'SIGTERM');
        resolve(response);
      };
      pollTimer = setInterval(() => resolveFromState(tuiAutomation), 500);
      pollTimer.unref?.();
      const tuiAutomation = invocation.stdinText && child.stdin
        ? new FreebuffTuiAutomation(child.stdin, invocation.stdinText)
        : null;
      child.stdout!.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stdout += text;
        tuiAutomation?.handleOutput(text);
        if (hasFreebuffTerminalControl(text)) terminalOutputDetected = true;
        if (!terminalOutputDetected) config.onTextChunk?.(stdout);
        resolveFromState(tuiAutomation);
      });
      child.stderr!.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      child.on('exit', (code, signal) => {
        if (settled) return;
        settled = true;
        cleanup();
        const cleanStdout = terminalOutputDetected ? sanitizeFreebuffProcessOutput(stdout) : stdout.trim();
        const cleanStderr = sanitizeFreebuffProcessOutput(stderr).trim();
        if (code === 0) resolve(cleanStdout.trim());
        else reject(new Error(cleanStderr || cleanStdout.trim() || `Freebuff exited with ${signal ?? code}`));
      });
    });
  }

  reset(): void {
    if (this.currentProcess) terminateFreebuffProcess(this.currentProcess, 'SIGTERM');
    this.currentProcess = null;
    this.currentAbortController?.abort();
    this.currentAbortController = null;
  }
}
