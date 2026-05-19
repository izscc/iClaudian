export const ANTIGRAVITY_SYNTHETIC_MODEL_ID = 'antigravity';
export const ANTIGRAVITY_MODEL_PREFIX = 'antigravity:';

const ANTIGRAVITY_MODEL_ALIASES = new Map<string, string>([
  ['antigravity-3.1-pro', 'antigravity-3.1-pro-preview'],
  ['auto-antigravity-3', 'antigravity-3-pro-preview'],
]);

export const ANTIGRAVITY_FALLBACK_MODELS = [
  {
    rawId: 'antigravity-3.1-pro-preview',
    label: 'antigravity-3.1-pro-preview',
    description: 'Latest Antigravity 3.1 Pro preview model in Antigravity CLI',
  },
  {
    rawId: 'antigravity-3-pro-preview',
    label: 'antigravity-3-pro-preview',
    description: 'Antigravity 3 Pro preview model',
  },
  {
    rawId: 'antigravity-3-flash-preview',
    label: 'antigravity-3-flash-preview',
    description: 'Antigravity 3 Flash preview model',
  },
  { rawId: 'antigravity-2.5-pro', label: 'antigravity-2.5-pro', description: 'Antigravity 2.5 Pro model' },
  { rawId: 'antigravity-2.5-flash', label: 'antigravity-2.5-flash', description: 'Antigravity 2.5 Flash model' },
  { rawId: 'antigravity-2.5-flash-lite', label: 'antigravity-2.5-flash-lite', description: 'Antigravity 2.5 Flash Lite model' },
] as const;

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
