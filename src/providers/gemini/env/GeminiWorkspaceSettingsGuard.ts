import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// gemini-cli's experimental "model steered context management" (update_topic)
// compresses the conversation mid-turn and drops the original user request —
// including <current_note_task> and freshly activated skill instructions — after
// which the model re-derives a task from its own topic summary and drifts
// (forensics: sessions f74a30af and 14ef5478, 2026-06-10/11). Workspace settings
// outrank ~/.gemini/settings.json, so pin the experiment off for vault runs.
export async function ensureGeminiWorkspaceSettingsGuard(vaultCwd: string): Promise<void> {
  const settingsDir = path.join(vaultCwd, '.gemini');
  const settingsPath = path.join(settingsDir, 'settings.json');

  let raw: string | null;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch {
    raw = null;
  }

  let current: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      current = parsed as Record<string, unknown>;
    } catch {
      // Never clobber a workspace settings file we cannot parse.
      return;
    }
  }

  const experimental = current.experimental && typeof current.experimental === 'object' && !Array.isArray(current.experimental)
    ? current.experimental as Record<string, unknown>
    : {};
  if (experimental.contextManagement === false) return;

  current.experimental = { ...experimental, contextManagement: false };
  await fs.mkdir(settingsDir, { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

// The workspace guard above is not sufficient on its own: session e04267ef
// still ran update_topic with the vault-level file in place (workspace settings
// can be skipped, e.g. for untrusted folders). gemini-cli's system overrides
// have the final say in the settings merge and their path can be redirected via
// GEMINI_CLI_SYSTEM_SETTINGS_PATH, so every spawned process gets this
// plugin-managed file. The default macOS system path
// (/Library/Application Support/GeminiCli/settings.json) is enterprise-managed
// and absent on typical installs, so shadowing it is acceptable.
const GEMINI_SYSTEM_OVERRIDES = { experimental: { contextManagement: false } };

export const GEMINI_SYSTEM_SETTINGS_ENV_KEY = 'GEMINI_CLI_SYSTEM_SETTINGS_PATH';

export async function ensureGeminiSystemSettingsOverride(vaultCwd: string): Promise<string> {
  const dir = path.join(vaultCwd, '.claudian');
  const overridePath = path.join(dir, 'gemini-system-settings.json');
  const content = `${JSON.stringify(GEMINI_SYSTEM_OVERRIDES, null, 2)}\n`;

  let existing: string | null;
  try {
    existing = await fs.readFile(overridePath, 'utf8');
  } catch {
    existing = null;
  }

  if (existing !== content) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(overridePath, content, 'utf8');
  }
  return overridePath;
}
