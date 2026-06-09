import { spawn } from 'node:child_process';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { buildFreebuffCliInvocation } from './FreebuffCliInvocation';
import { persistFreebuffModelSelection } from './FreebuffModelSettings';
import { hasFreebuffTerminalControl, sanitizeFreebuffProcessOutput } from './FreebuffOutputSanitizer';
import { buildFreebuffRuntimeEnv } from './FreebuffRuntimeEnvironment';
import { FreebuffTuiAutomation } from './FreebuffTuiAutomation';

export class FreebuffAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;

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
      const child = spawn(invocation.command, invocation.args, {
        cwd,
        env,
        signal: this.currentAbortController?.signal,
        stdio: invocation.stdinText ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let terminalOutputDetected = false;
      const tuiAutomation = invocation.stdinText && child.stdin
        ? new FreebuffTuiAutomation(child.stdin, invocation.stdinText)
        : null;
      child.stdout!.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stdout += text;
        tuiAutomation?.handleOutput(text);
        if (hasFreebuffTerminalControl(text)) terminalOutputDetected = true;
        if (!terminalOutputDetected) config.onTextChunk?.(stdout);
      });
      child.stderr!.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('exit', (code, signal) => {
        const cleanStdout = terminalOutputDetected ? sanitizeFreebuffProcessOutput(stdout) : stdout.trim();
        const cleanStderr = sanitizeFreebuffProcessOutput(stderr).trim();
        if (code === 0) resolve(cleanStdout.trim());
        else reject(new Error(cleanStderr || cleanStdout.trim() || `Freebuff exited with ${signal ?? code}`));
      });
    });
  }

  reset(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = null;
  }
}
