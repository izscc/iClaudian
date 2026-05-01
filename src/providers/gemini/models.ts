export const GEMINI_SYNTHETIC_MODEL_ID = 'gemini';
export const GEMINI_MODEL_PREFIX = 'gemini:';

export function encodeGeminiModelId(rawId: string): string {
  return `${GEMINI_MODEL_PREFIX}${rawId}`;
}

export function decodeGeminiModelId(model: string): string | null {
  if (model === GEMINI_SYNTHETIC_MODEL_ID) return null;
  return model.startsWith(GEMINI_MODEL_PREFIX) ? model.slice(GEMINI_MODEL_PREFIX.length) : null;
}

export function isGeminiModelSelectionId(model: string): boolean {
  return model === GEMINI_SYNTHETIC_MODEL_ID || model.startsWith(GEMINI_MODEL_PREFIX);
}
