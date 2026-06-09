import type { ProviderCapabilities } from '../../core/providers/types';

export const FREEBUFF_PROVIDER_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  providerId: 'freebuff',
  supportsPersistentRuntime: false,
  supportsNativeHistory: false,
  supportsPlanMode: true,
  supportsRewind: false,
  supportsFork: false,
  supportsProviderCommands: false,
  supportsImageAttachments: false,
  supportsInstructionMode: true,
  supportsMcpTools: true,
  supportsTurnSteer: false,
  reasoningControl: 'none',
});
