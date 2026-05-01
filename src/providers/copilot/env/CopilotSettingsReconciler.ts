import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { decodeCopilotModelId, encodeCopilotModelId, isCopilotModelSelectionId } from '../models';
import { getCopilotProviderSettings, updateCopilotProviderSettings } from '../settings';

const COPILOT_ENV_HASH_KEYS = ['COPILOT_ALLOW_ALL', 'COPILOT_LOG_LEVEL', 'GITHUB_TOKEN', 'GH_TOKEN'];

function computeCopilotEnvHash(envText: string): string {
  const envVars = parseEnvironmentVariables(envText || '');
  return COPILOT_ENV_HASH_KEYS.filter(key => envVars[key]).map(key => `${key}=${envVars[key]}`).sort().join('|');
}

export const copilotSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(settings: Record<string, unknown>, conversations: Conversation[]): { changed: boolean; invalidatedConversations: Conversation[] } {
    const envText = getRuntimeEnvironmentText(settings, 'copilot');
    const currentHash = computeCopilotEnvHash(envText);
    const savedHash = getCopilotProviderSettings(settings).environmentHash;
    if (currentHash === savedHash) return { changed: false, invalidatedConversations: [] };
    const invalidatedConversations: Conversation[] = [];
    for (const conversation of conversations) {
      if (conversation.providerId === 'copilot' && conversation.sessionId) {
        conversation.sessionId = null;
        conversation.providerState = undefined;
        invalidatedConversations.push(conversation);
      }
    }
    updateCopilotProviderSettings(settings, { environmentHash: currentHash });
    return { changed: true, invalidatedConversations };
  },
  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    return normalizeProjectedModel(settings, 'copilot');
  },
};


function normalizeProjectedModel(settings: Record<string, unknown>, providerId: string): boolean {
  let changed = false;
  if (typeof settings.model === 'string' && isCopilotModelSelectionId(settings.model)) {
    const raw = decodeCopilotModelId(settings.model);
    const normalized = raw ? encodeCopilotModelId(raw) : settings.model;
    if (normalized !== settings.model) {
      settings.model = normalized;
      changed = true;
    }
  }
  const saved = settings.savedProviderModel;
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    const map = saved as Record<string, unknown>;
    const value = map[providerId];
    if (typeof value === 'string' && isCopilotModelSelectionId(value)) {
      const raw = decodeCopilotModelId(value);
      const normalized = raw ? encodeCopilotModelId(raw) : value;
      if (normalized !== value) {
        map[providerId] = normalized;
        changed = true;
      }
    }
  }
  return changed;
}
