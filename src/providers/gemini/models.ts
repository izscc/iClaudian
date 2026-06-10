export const GEMINI_SYNTHETIC_MODEL_ID = 'gemini';
export const GEMINI_MODEL_PREFIX = 'gemini:';

const GEMINI_MODEL_ALIASES = new Map<string, string>([
  ['gemini-3.1-pro', 'gemini-3.1-pro-preview'],
  ['auto-gemini-3', 'gemini-3-pro-preview'],
]);

export const GEMINI_FALLBACK_MODELS = [
  {
    rawId: 'gemini-3.1-pro-preview',
    label: 'gemini-3.1-pro-preview',
    description: 'Latest Gemini 3.1 Pro preview model in Gemini CLI',
  },
  {
    rawId: 'gemini-3-flash-preview',
    label: 'gemini-3-flash-preview',
    description: 'Gemini 3 Flash preview model',
  },
  {
    rawId: 'gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite',
    description: 'Gemini 3.1 Flash Lite model',
  },
  {
    rawId: 'gemma-4-31b-it',
    label: 'gemma-4-31b-it',
    description: 'Gemma 4 31B instruction-tuned model',
  },
] as const;

export function normalizeGeminiRawModelId(rawId: string): string {
  const trimmed = rawId.trim();
  return GEMINI_MODEL_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

export function encodeGeminiModelId(rawId: string): string {
  const normalized = normalizeGeminiRawModelId(rawId);
  return normalized ? `${GEMINI_MODEL_PREFIX}${normalized}` : GEMINI_SYNTHETIC_MODEL_ID;
}

export function decodeGeminiModelId(model: string): string | null {
  if (model === GEMINI_SYNTHETIC_MODEL_ID) return null;
  return model.startsWith(GEMINI_MODEL_PREFIX)
    ? normalizeGeminiRawModelId(model.slice(GEMINI_MODEL_PREFIX.length))
    : null;
}

export function isGeminiModelSelectionId(model: string): boolean {
  return model === GEMINI_SYNTHETIC_MODEL_ID || model.startsWith(GEMINI_MODEL_PREFIX);
}
