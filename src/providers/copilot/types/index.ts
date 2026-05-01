export interface CopilotProviderState {
  sessionCwd?: string;
}

export function getCopilotState(value: unknown): CopilotProviderState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    ...(typeof raw.sessionCwd === 'string' && raw.sessionCwd.trim() ? { sessionCwd: raw.sessionCwd.trim() } : {}),
  };
}
