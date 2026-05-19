import type { ProviderRegistration } from '../../core/providers/types';
import { AntigravityInlineEditService } from './auxiliary/AntigravityInlineEditService';
import { AntigravityInstructionRefineService } from './auxiliary/AntigravityInstructionRefineService';
import { AntigravityTaskResultInterpreter } from './auxiliary/AntigravityTaskResultInterpreter';
import { AntigravityTitleGenerationService } from './auxiliary/AntigravityTitleGenerationService';
import { ANTIGRAVITY_PROVIDER_CAPABILITIES } from './capabilities';
import { antigravitySettingsReconciler } from './env/AntigravitySettingsReconciler';
import { AntigravityChatRuntime } from './runtime/AntigravityChatRuntime';
import { getAntigravityProviderSettings } from './settings';
import { antigravityChatUIConfig } from './ui/AntigravityChatUIConfig';

const noHistoryService = {
  async hydrateConversationHistory() {},
  async deleteConversationSession() {},
  resolveSessionIdForConversation: (conversation: { sessionId?: string | null } | null) => conversation?.sessionId ?? null,
  isPendingForkConversation: () => false,
  buildForkProviderState: () => ({}),
};

export const antigravityProviderRegistration: ProviderRegistration = {
  blankTabOrder: 12,
  capabilities: ANTIGRAVITY_PROVIDER_CAPABILITIES,
  chatUIConfig: antigravityChatUIConfig,
  createInlineEditService: plugin => new AntigravityInlineEditService(plugin),
  createInstructionRefineService: plugin => new AntigravityInstructionRefineService(plugin),
  createRuntime: ({ plugin }) => new AntigravityChatRuntime(plugin),
  createTitleGenerationService: plugin => new AntigravityTitleGenerationService(plugin),
  displayName: 'Antigravity',
  environmentKeyPatterns: [/^ANTIGRAVITY_/i, /^GOOGLE_/i],
  historyService: noHistoryService,
  isEnabled: settings => getAntigravityProviderSettings(settings).enabled,
  settingsReconciler: antigravitySettingsReconciler,
  taskResultInterpreter: new AntigravityTaskResultInterpreter(),
};
