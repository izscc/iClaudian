import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ensureGeminiWorkspaceSettingsGuard } from '../../../../src/providers/gemini/env/GeminiWorkspaceSettingsGuard';

describe('ensureGeminiWorkspaceSettingsGuard', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-guard-'));
  });

  afterEach(async () => {
    await fs.rm(vaultDir, { force: true, recursive: true });
  });

  const settingsPath = () => path.join(vaultDir, '.gemini', 'settings.json');

  it('creates workspace settings that disable contextManagement', async () => {
    await ensureGeminiWorkspaceSettingsGuard(vaultDir);

    const written = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    expect(written.experimental.contextManagement).toBe(false);
  });

  it('merges into existing settings without dropping other keys', async () => {
    await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
    await fs.writeFile(settingsPath(), JSON.stringify({
      experimental: { autoMemory: true, contextManagement: true },
      model: { name: 'gemini-3.1-pro-preview' },
    }));

    await ensureGeminiWorkspaceSettingsGuard(vaultDir);

    const written = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    expect(written.experimental).toEqual({ autoMemory: true, contextManagement: false });
    expect(written.model).toEqual({ name: 'gemini-3.1-pro-preview' });
  });

  it('leaves an already-disabled file untouched', async () => {
    await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
    const original = JSON.stringify({ experimental: { contextManagement: false } });
    await fs.writeFile(settingsPath(), original);

    await ensureGeminiWorkspaceSettingsGuard(vaultDir);

    expect(await fs.readFile(settingsPath(), 'utf8')).toBe(original);
  });

  it('does not clobber an unparseable settings file', async () => {
    await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
    await fs.writeFile(settingsPath(), '{ not json');

    await ensureGeminiWorkspaceSettingsGuard(vaultDir);

    expect(await fs.readFile(settingsPath(), 'utf8')).toBe('{ not json');
  });
});
