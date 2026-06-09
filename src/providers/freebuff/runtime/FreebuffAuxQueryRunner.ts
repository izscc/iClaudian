import { spawn } from 'node:child_process';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { buildFreebuffCliInvocation } from './FreebuffCliInvocation';
import { buildFreebuffRuntimeEnv } from './FreebuffRuntimeEnvironment';

export class FreebuffAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const configuredCliPath = this.plugin.getResolvedProviderCliPath('freebuff');
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
      if (invocation.stdinText && child.stdin) {
        child.stdin.write(invocation.stdinText);
        child.stdin.end();
      }
      child.stdout!.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
        config.onTextChunk?.(stdout);
      });
      child.stderr!.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('exit', (code, signal) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.trim() || `Freebuff exited with ${signal ?? code}`));
      });
    });
  }

  reset(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = null;
  }
}
