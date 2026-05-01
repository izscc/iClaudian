import type { ProviderCapabilities } from '../../core/providers/types';

export const GEMINI_PROVIDER_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  providerId: 'gemini',
  supportsPersistentRuntime: true,
  supportsNativeHistory: true,
  supportsPlanMode: true,
  supportsRewind: false,
  supportsFork: false,
  supportsProviderCommands: true,
  supportsImageAttachments: true,
  supportsInstructionMode: true,
  supportsMcpTools: true,
  supportsTurnSteer: false,
  reasoningControl: 'none',
});
