import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { decodeAntigravityModelId, encodeAntigravityModelId, isAntigravityModelSelectionId } from '../models';
import { getAntigravityProviderSettings, updateAntigravityProviderSettings } from '../settings';

const ANTIGRAVITY_ENV_HASH_KEYS = ['ANTIGRAVITY_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI'];

function computeAntigravityEnvHash(envText: string): string {
  const envVars = parseEnvironmentVariables(envText || '');
  return ANTIGRAVITY_ENV_HASH_KEYS.filter(key => envVars[key]).map(key => `${key}=${envVars[key]}`).sort().join('|');
}

export const antigravitySettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(settings: Record<string, unknown>, conversations: Conversation[]): { changed: boolean; invalidatedConversations: Conversation[] } {
    const envText = getRuntimeEnvironmentText(settings, 'antigravity');
    const currentHash = computeAntigravityEnvHash(envText);
    const savedHash = getAntigravityProviderSettings(settings).environmentHash;
    if (currentHash === savedHash) return { changed: false, invalidatedConversations: [] };
    const invalidatedConversations: Conversation[] = [];
    for (const conversation of conversations) {
      if (conversation.providerId === 'antigravity' && conversation.sessionId) {
        conversation.sessionId = null;
        conversation.providerState = undefined;
        invalidatedConversations.push(conversation);
      }
    }
    updateAntigravityProviderSettings(settings, { environmentHash: currentHash });
    return { changed: true, invalidatedConversations };
  },
  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    return normalizeProjectedModel(settings, 'antigravity');
  },
};


function normalizeProjectedModel(settings: Record<string, unknown>, providerId: string): boolean {
  let changed = false;
  if (typeof settings.model === 'string' && isAntigravityModelSelectionId(settings.model)) {
    const raw = decodeAntigravityModelId(settings.model);
    const normalized = raw ? encodeAntigravityModelId(raw) : settings.model;
    if (normalized !== settings.model) {
      settings.model = normalized;
      changed = true;
    }
  }
  const saved = settings.savedProviderModel;
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    const map = saved as Record<string, unknown>;
    const value = map[providerId];
    if (typeof value === 'string' && isAntigravityModelSelectionId(value)) {
      const raw = decodeAntigravityModelId(value);
      const normalized = raw ? encodeAntigravityModelId(raw) : value;
      if (normalized !== value) {
        map[providerId] = normalized;
        changed = true;
      }
    }
  }
  return changed;
}
