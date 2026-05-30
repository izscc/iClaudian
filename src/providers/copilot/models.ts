export const COPILOT_SYNTHETIC_MODEL_ID = 'copilot';
export const COPILOT_MODEL_PREFIX = 'copilot:';

/**
 * Fallback models for GitHub Copilot CLI.
 * Keep this list aligned with `copilot help config` on current Copilot CLI releases.
 */
export const COPILOT_FALLBACK_MODELS = [
  { rawId: 'claude-sonnet-4.6', label: 'claude-sonnet-4.6', description: 'Claude Sonnet 4.6 through GitHub Copilot CLI' },
  { rawId: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5', description: 'Claude Sonnet 4.5 through GitHub Copilot CLI' },
  { rawId: 'claude-haiku-4.5', label: 'claude-haiku-4.5', description: 'Claude Haiku 4.5 through GitHub Copilot CLI' },
  { rawId: 'claude-opus-4.8', label: 'claude-opus-4.8', description: 'Claude Opus 4.8 through GitHub Copilot CLI' },
  { rawId: 'claude-opus-4.7', label: 'claude-opus-4.7', description: 'Claude Opus 4.7 through GitHub Copilot CLI' },
  { rawId: 'claude-opus-4.6', label: 'claude-opus-4.6', description: 'Claude Opus 4.6 through GitHub Copilot CLI' },
  { rawId: 'claude-opus-4.6-fast', label: 'claude-opus-4.6-fast', description: 'Claude Opus 4.6 Fast through GitHub Copilot CLI' },
  { rawId: 'claude-opus-4.5', label: 'claude-opus-4.5', description: 'Claude Opus 4.5 through GitHub Copilot CLI' },
  { rawId: 'gpt-5.5', label: 'gpt-5.5', description: 'OpenAI GPT-5.5 through GitHub Copilot CLI' },
  { rawId: 'gpt-5.4', label: 'gpt-5.4', description: 'OpenAI GPT-5.4 through GitHub Copilot CLI' },
  { rawId: 'gpt-5.3-codex', label: 'gpt-5.3-codex', description: 'OpenAI GPT-5.3 Codex through GitHub Copilot CLI' },
  { rawId: 'gpt-5.2-codex', label: 'gpt-5.2-codex', description: 'OpenAI GPT-5.2 Codex through GitHub Copilot CLI' },
  { rawId: 'gpt-5.2', label: 'gpt-5.2', description: 'OpenAI GPT-5.2 through GitHub Copilot CLI' },
  { rawId: 'gpt-5.4-mini', label: 'gpt-5.4-mini', description: 'OpenAI GPT-5.4 Mini through GitHub Copilot CLI' },
  { rawId: 'gpt-5-mini', label: 'gpt-5-mini', description: 'OpenAI GPT-5 Mini through GitHub Copilot CLI' },
  { rawId: 'gpt-4.1', label: 'gpt-4.1', description: 'OpenAI GPT-4.1 through GitHub Copilot CLI' },
] as const;

const COPILOT_MODEL_ALIASES = new Map<string, string>([
  ['claude-sonnet-4', 'claude-sonnet-4.6'],
  ['gpt-5.1', 'gpt-5.4'],
]);

export function normalizeCopilotRawModelId(rawId: string): string {
  const trimmed = rawId.trim();
  const unprefixed = trimmed.startsWith('copilot/') ? trimmed.slice('copilot/'.length) : trimmed;
  return COPILOT_MODEL_ALIASES.get(unprefixed.toLowerCase()) ?? unprefixed;
}

export function encodeCopilotModelId(rawId: string): string {
  const normalized = normalizeCopilotRawModelId(rawId);
  return normalized ? `${COPILOT_MODEL_PREFIX}${normalized}` : COPILOT_SYNTHETIC_MODEL_ID;
}

export function decodeCopilotModelId(model: string): string | null {
  if (model === COPILOT_SYNTHETIC_MODEL_ID) return null;
  return model.startsWith(COPILOT_MODEL_PREFIX)
    ? normalizeCopilotRawModelId(model.slice(COPILOT_MODEL_PREFIX.length))
    : null;
}

export function isCopilotModelSelectionId(model: string): boolean {
  return model === COPILOT_SYNTHETIC_MODEL_ID || model.startsWith(COPILOT_MODEL_PREFIX);
}
