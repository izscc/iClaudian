import { spawn } from 'node:child_process';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { decodeGeminiModelId } from '../models';
import { buildGeminiRuntimeEnv } from './GeminiRuntimeEnvironment';

export class GeminiAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const resolvedCliPath = this.plugin.getResolvedProviderCliPath('gemini') ?? 'gemini';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildGeminiRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, resolvedCliPath);
    const model = config.model ? decodeGeminiModelId(config.model) ?? config.model : '';
    const args = ['--prompt', prompt, '--approval-mode', 'plan', '--output-format', 'text'];
    if (model) args.unshift('--model', model);

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
        else reject(new Error(stderr.trim() || `Gemini exited with ${signal ?? code}`));
      });
    });
  }

  reset(): void { this.currentAbortController?.abort(); this.currentAbortController = null; }
}
