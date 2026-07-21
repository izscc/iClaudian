import { spawn } from 'node:child_process';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { ANTIGRAVITY_SYNTHETIC_MODEL_ID, decodeAntigravityModelId } from '../models';
import { getAntigravityProviderSettings } from '../settings';
import { buildAntigravityPrintArgs } from './AntigravityCliInvocation';
import { buildAntigravityRuntimeEnv } from './AntigravityRuntimeEnvironment';

export class AntigravityAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const resolvedCliPath = this.plugin.getResolvedProviderCliPath('antigravity') ?? 'agy';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildAntigravityRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, resolvedCliPath);
    const model = config.model && config.model !== ANTIGRAVITY_SYNTHETIC_MODEL_ID
      ? decodeAntigravityModelId(config.model) ?? config.model
      : '';
    const antigravitySettings = getAntigravityProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    const args = buildAntigravityPrintArgs({
      approvalMode: antigravitySettings.selectedApprovalMode,
      continueConversation: false,
      model: model || null,
      prompt,
    });

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
        else reject(new Error(stderr.trim() || `Antigravity exited with ${signal ?? code}`));
      });
    });
  }

  reset(): void { this.currentAbortController?.abort(); this.currentAbortController = null; }
}
