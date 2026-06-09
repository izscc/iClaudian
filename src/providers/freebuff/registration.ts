import type { ProviderRegistration } from '../../core/providers/types';
import { FreebuffInlineEditService } from './auxiliary/FreebuffInlineEditService';
import { FreebuffInstructionRefineService } from './auxiliary/FreebuffInstructionRefineService';
import { FreebuffTaskResultInterpreter } from './auxiliary/FreebuffTaskResultInterpreter';
import { FreebuffTitleGenerationService } from './auxiliary/FreebuffTitleGenerationService';
import { FREEBUFF_PROVIDER_CAPABILITIES } from './capabilities';
import { freebuffSettingsReconciler } from './env/FreebuffSettingsReconciler';
import { FreebuffChatRuntime } from './runtime/FreebuffChatRuntime';
import { getFreebuffProviderSettings } from './settings';
import { freebuffChatUIConfig } from './ui/FreebuffChatUIConfig';

const noHistoryService = {
  async hydrateConversationHistory() {},
  async deleteConversationSession() {},
  resolveSessionIdForConversation: (conversation: { sessionId?: string | null } | null) => conversation?.sessionId ?? null,
  isPendingForkConversation: () => false,
  buildForkProviderState: () => ({}),
};

export const freebuffProviderRegistration: ProviderRegistration = {
  blankTabOrder: 14,
  capabilities: FREEBUFF_PROVIDER_CAPABILITIES,
  chatUIConfig: freebuffChatUIConfig,
  createInlineEditService: plugin => new FreebuffInlineEditService(plugin),
  createInstructionRefineService: plugin => new FreebuffInstructionRefineService(plugin),
  createRuntime: ({ plugin }) => new FreebuffChatRuntime(plugin),
  createTitleGenerationService: plugin => new FreebuffTitleGenerationService(plugin),
  displayName: 'Freebuff',
  environmentKeyPatterns: [/^FREEBUFF_/i],
  historyService: noHistoryService,
  isEnabled: settings => getFreebuffProviderSettings(settings).enabled,
  settingsReconciler: freebuffSettingsReconciler,
  taskResultInterpreter: new FreebuffTaskResultInterpreter(),
};
