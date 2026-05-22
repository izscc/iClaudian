import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { decodeAntigravityModelId } from '../models';
import { getAntigravityProviderSettings } from '../settings';
import { buildAntigravityRuntimeEnv } from './AntigravityRuntimeEnvironment';

export class AntigravityAuxQueryRunner implements AuxQueryRunner {
  private currentAbortController: AbortController | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const resolvedCliPath = this.plugin.getResolvedProviderCliPath('antigravity') ?? 'agy';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildAntigravityRuntimeEnv(this.plugin.settings as unknown as Record<string, unknown>, resolvedCliPath);
    const model = config.model ? decodeAntigravityModelId(config.model) ?? config.model : '';
    await this.persistSelectedModel(model);
    const antigravitySettings = getAntigravityProviderSettings(this.plugin.settings as unknown as Record<string, unknown>);
    const args = [
      ...(antigravitySettings.selectedApprovalMode === 'yolo' ? ['--dangerously-skip-permissions'] : []),
      '--print',
      prompt,
      '--print-timeout',
      '5m',
    ];

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

  private async persistSelectedModel(model: string): Promise<void> {
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

  reset(): void { this.currentAbortController?.abort(); this.currentAbortController = null; }
}
