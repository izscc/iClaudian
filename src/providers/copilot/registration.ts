import type { ProviderRegistration } from '../../core/providers/types';
import { CopilotInlineEditService } from './auxiliary/CopilotInlineEditService';
import { CopilotInstructionRefineService } from './auxiliary/CopilotInstructionRefineService';
import { CopilotTaskResultInterpreter } from './auxiliary/CopilotTaskResultInterpreter';
import { CopilotTitleGenerationService } from './auxiliary/CopilotTitleGenerationService';
import { COPILOT_PROVIDER_CAPABILITIES } from './capabilities';
import { copilotSettingsReconciler } from './env/CopilotSettingsReconciler';
import { CopilotChatRuntime } from './runtime/CopilotChatRuntime';
import { getCopilotProviderSettings } from './settings';
import { copilotChatUIConfig } from './ui/CopilotChatUIConfig';

const noHistoryService = {
  async hydrateConversationHistory() {},
  async deleteConversationSession() {},
  resolveSessionIdForConversation: (conversation: { sessionId?: string | null } | null) => conversation?.sessionId ?? null,
  isPendingForkConversation: () => false,
  buildForkProviderState: () => ({}),
};

export const copilotProviderRegistration: ProviderRegistration = {
  blankTabOrder: 13,
  capabilities: COPILOT_PROVIDER_CAPABILITIES,
  chatUIConfig: copilotChatUIConfig,
  createInlineEditService: plugin => new CopilotInlineEditService(plugin),
  createInstructionRefineService: plugin => new CopilotInstructionRefineService(plugin),
  createRuntime: ({ plugin }) => new CopilotChatRuntime(plugin),
  createTitleGenerationService: plugin => new CopilotTitleGenerationService(plugin),
  displayName: 'Copilot',
  environmentKeyPatterns: [/^COPILOT_/i, /^GITHUB_/i, /^GH_/i],
  historyService: noHistoryService,
  isEnabled: settings => getCopilotProviderSettings(settings).enabled,
  settingsReconciler: copilotSettingsReconciler,
  taskResultInterpreter: new CopilotTaskResultInterpreter(),
};
