import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { deriveGeminiLocalTitle } from '../../../../src/providers/gemini/auxiliary/GeminiTitleGenerationService';
import { ensureGeminiSystemSettingsOverride, ensureGeminiWorkspaceSettingsGuard } from '../../../../src/providers/gemini/env/GeminiWorkspaceSettingsGuard';

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

describe('ensureGeminiSystemSettingsOverride', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-sys-'));
  });

  afterEach(async () => {
    await fs.rm(vaultDir, { force: true, recursive: true });
  });

  it('writes the managed override file and returns its path', async () => {
    const overridePath = await ensureGeminiSystemSettingsOverride(vaultDir);

    expect(overridePath).toBe(path.join(vaultDir, '.claudian', 'gemini-system-settings.json'));
    const written = JSON.parse(await fs.readFile(overridePath, 'utf8'));
    expect(written).toEqual({ experimental: { contextManagement: false } });
  });

  it('rewrites a drifted override file back to the managed content', async () => {
    const overridePath = await ensureGeminiSystemSettingsOverride(vaultDir);
    await fs.writeFile(overridePath, '{"experimental":{"contextManagement":true}}');

    await ensureGeminiSystemSettingsOverride(vaultDir);

    const written = JSON.parse(await fs.readFile(overridePath, 'utf8'));
    expect(written.experimental.contextManagement).toBe(false);
  });
});

describe('deriveGeminiLocalTitle', () => {
  it('takes the first non-empty line capped at 10 chars', () => {
    expect(deriveGeminiLocalTitle('翻译')).toBe('翻译');
    expect(deriveGeminiLocalTitle('\n  帮我把这篇笔记完整翻译成中文并重命名\n其他')).toBe('帮我把这篇笔记完整翻');
  });

  it('collapses whitespace and falls back when empty', () => {
    expect(deriveGeminiLocalTitle('fix   the\tbug now please')).toBe('fix the bu');
    expect(deriveGeminiLocalTitle('   \n  ')).toBe('新对话');
  });
});
