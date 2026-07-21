export const ANTIGRAVITY_SYNTHETIC_MODEL_ID = 'antigravity';
export const ANTIGRAVITY_MODEL_PREFIX = 'antigravity:';

/**
 * Fallback models for Antigravity provider.
 * These match the list seen in the agy CLI model switcher.
 */
export const ANTIGRAVITY_FALLBACK_MODELS = [
  {
    rawId: 'gemini-3.6-flash-medium',
    label: 'Gemini 3.6 Flash (Medium)',
    description: 'Antigravity Gemini 3.6 Flash - Medium Effort',
  },
  {
    rawId: 'gemini-3.6-flash-high',
    label: 'Gemini 3.6 Flash (High)',
    description: 'Antigravity Gemini 3.6 Flash - High Effort',
  },
  {
    rawId: 'gemini-3.6-flash-low',
    label: 'Gemini 3.6 Flash (Low)',
    description: 'Antigravity Gemini 3.6 Flash - Low Effort',
  },
  {
    rawId: 'gemini-3.5-flash-medium',
    label: 'Gemini 3.5 Flash (Medium)',
    description: 'Antigravity Gemini 3.5 Flash - Medium Effort',
  },
  {
    rawId: 'gemini-3.5-flash-high',
    label: 'Gemini 3.5 Flash (High)',
    description: 'Antigravity Gemini 3.5 Flash - High Effort',
  },
  {
    rawId: 'gemini-3.5-flash-low',
    label: 'Gemini 3.5 Flash (Low)',
    description: 'Antigravity Gemini 3.5 Flash - Low Effort',
  },
  {
    rawId: 'gemini-3.1-pro-high',
    label: 'Gemini 3.1 Pro (High)',
    description: 'Antigravity Gemini 3.1 Pro - High Effort',
  },
  {
    rawId: 'gemini-3.1-pro-low',
    label: 'Gemini 3.1 Pro (Low)',
    description: 'Antigravity Gemini 3.1 Pro - Low Effort',
  },
  {
    rawId: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6 (Thinking)',
    description: 'Antigravity Claude Sonnet 4.6 - Thinking Mode',
  },
  {
    rawId: 'claude-opus-4-6-thinking',
    label: 'Claude Opus 4.6 (Thinking)',
    description: 'Antigravity Claude Opus 4.6 - Thinking Mode',
  },
  {
    rawId: 'gpt-oss-120b-medium',
    label: 'GPT-OSS 120B (Medium)',
    description: 'Antigravity GPT-OSS 120B - Medium Effort',
  },
] as const;

const ANTIGRAVITY_MODEL_ALIASES = new Map<string, string>([
  ['gemini 3.6 flash (medium)', 'gemini-3.6-flash-medium'],
  ['gemini 3.6 flash (high)', 'gemini-3.6-flash-high'],
  ['gemini 3.6 flash (low)', 'gemini-3.6-flash-low'],
  ['gemini-3.6-flash', 'gemini-3.6-flash-medium'],
  ['gemini 3.5 flash (medium)', 'gemini-3.5-flash-medium'],
  ['gemini 3.5 flash (high)', 'gemini-3.5-flash-high'],
  ['gemini 3.5 flash (low)', 'gemini-3.5-flash-low'],
  ['gemini-3.5-flash', 'gemini-3.5-flash-medium'],
  ['gemini 3.1 pro (high)', 'gemini-3.1-pro-high'],
  ['gemini 3.1 pro (low)', 'gemini-3.1-pro-low'],
  ['claude sonnet 4.6 (thinking)', 'claude-sonnet-4-6'],
  ['claude opus 4.6 (thinking)', 'claude-opus-4-6-thinking'],
  ['gpt-oss 120b (medium)', 'gpt-oss-120b-medium'],
  ['gemini-3-flash-agent', 'gemini-3.5-flash-high'],
  ['claude-sonnet-4-6@default', 'claude-sonnet-4-6'],
  ['claude-opus-4-6@default', 'claude-opus-4-6-thinking'],
  ['openai/gpt-oss-120b-maas', 'gpt-oss-120b-medium'],
]);

export function normalizeAntigravityRawModelId(rawId: string): string {
  const trimmed = rawId.trim();
  return ANTIGRAVITY_MODEL_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
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
