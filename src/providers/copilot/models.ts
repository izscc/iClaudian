export const COPILOT_SYNTHETIC_MODEL_ID = 'copilot';
export const COPILOT_MODEL_PREFIX = 'copilot:';

export const COPILOT_FALLBACK_MODELS = [
  { rawId: 'gpt-5.4', label: 'gpt-5.4', description: 'OpenAI GPT-5.4 through GitHub Copilot CLI' },
  { rawId: 'gpt-5.4-mini', label: 'gpt-5.4-mini', description: 'Fast GPT-5.4 Mini through GitHub Copilot CLI' },
  { rawId: 'gpt-5.2', label: 'gpt-5.2', description: 'Documented Copilot CLI example model' },
  { rawId: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5', description: 'Claude Sonnet via GitHub Copilot CLI when available' },
] as const;

export function normalizeCopilotRawModelId(rawId: string): string {
  const trimmed = rawId.trim();
  return trimmed.startsWith('copilot/') ? trimmed.slice('copilot/'.length) : trimmed;
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
