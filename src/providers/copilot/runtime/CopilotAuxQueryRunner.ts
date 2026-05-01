import { spawn } from 'node:child_process';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { decodeCopilotModelId } from '../models';
import { buildCopilotRuntimeEnv } from './CopilotRuntimeEnvironment';

export class CopilotAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const resolvedCliPath = this.plugin.getResolvedProviderCliPath('copilot') ?? 'copilot';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildCopilotRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, resolvedCliPath);
    const model = config.model ? decodeCopilotModelId(config.model) ?? config.model : '';
    const effort = typeof this.plugin.settings.effortLevel === 'string' ? this.plugin.settings.effortLevel : '';
    const args = ['--prompt', prompt, '--silent', '--no-remote', '--allow-all-tools'];
    if (model) args.unshift('--model', model);
    if (['low', 'medium', 'high', 'xhigh'].includes(effort)) args.unshift('--effort', effort);

    this.currentAbortController = config.abortController ?? new AbortController();
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(resolvedCliPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], signal: this.currentAbortController?.signal });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
        config.onTextChunk?.(stdout);
      });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('exit', (code, signal) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.trim() || `Copilot exited with ${signal ?? code}`));
      });
    });
  }

  reset(): void { this.currentAbortController?.abort(); this.currentAbortController = null; }
}
