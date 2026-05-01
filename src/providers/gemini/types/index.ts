export interface GeminiProviderState {
  sessionCwd?: string;
}

export function getGeminiState(value: unknown): GeminiProviderState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    ...(typeof raw.sessionCwd === 'string' && raw.sessionCwd.trim() ? { sessionCwd: raw.sessionCwd.trim() } : {}),
  };
}
