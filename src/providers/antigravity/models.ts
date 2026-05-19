export const ANTIGRAVITY_SYNTHETIC_MODEL_ID = 'antigravity';
export const ANTIGRAVITY_MODEL_PREFIX = 'antigravity:';

/**
 * Fallback models for Antigravity provider.
 * These match the list seen in the agy CLI model switcher.
 */
export const ANTIGRAVITY_FALLBACK_MODELS = [
  {
    rawId: 'Gemini 3.5 Flash (High)',
    label: 'Gemini 3.5 Flash (High)',
    description: 'Antigravity Gemini 3.5 Flash - High Effort',
  },
  {
    rawId: 'Gemini 3.5 Flash (Low)',
    label: 'Gemini 3.5 Flash (Low)',
    description: 'Antigravity Gemini 3.5 Flash - Low Effort',
  },
  {
    rawId: 'Gemini 3.1 Pro (High)',
    label: 'Gemini 3.1 Pro (High)',
    description: 'Antigravity Gemini 3.1 Pro - High Effort',
  },
  {
    rawId: 'Gemini 3.1 Pro (Low)',
    label: 'Gemini 3.1 Pro (Low)',
    description: 'Antigravity Gemini 3.1 Pro - Low Effort',
  },
  {
    rawId: 'Claude Sonnet 4.6 (Thinking)',
    label: 'Claude Sonnet 4.6 (Thinking)',
    description: 'Antigravity Claude Sonnet 4.6 - Thinking Mode',
  },
  {
    rawId: 'Claude Opus 4.6 (Thinking)',
    label: 'Claude Opus 4.6 (Thinking)',
    description: 'Antigravity Claude Opus 4.6 - Thinking Mode',
  },
  {
    rawId: 'GPT-OSS 120B (Medium)',
    label: 'GPT-OSS 120B (Medium)',
    description: 'Antigravity GPT-OSS 120B - Medium Effort',
  },
] as const;

export function normalizeAntigravityRawModelId(rawId: string): string {
  return rawId.trim();
}

export function encodeAntigravityModelId(rawId: string): string {
  const normalized = normalizeAntigravityRawModelId(rawId);
  return normalized ? `${ANTIGRAVITY_MODEL_PREFIX}${normalized}` : ANTIGRAVITY_SYNTHETIC_MODEL_ID;
}

export function decodeAntigravityModelId(model: string): string | null {
  if (model === ANTIGRAVITY_SYNTHETIC_MODEL_ID) return null;
  return model.startsWith(ANTIGRAVITY_MODEL_PREFIX)
    ? normalizeAntigravityRawModelId(model.slice(ANTIGRAVITY_MODEL_PREFIX.length))
    : null;
}

export function isAntigravityModelSelectionId(model: string): boolean {
  return model === ANTIGRAVITY_SYNTHETIC_MODEL_ID || model.startsWith(ANTIGRAVITY_MODEL_PREFIX);
}
