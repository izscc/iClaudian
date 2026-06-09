import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { decodeFreebuffModelId, encodeFreebuffModelId, isFreebuffModelSelectionId } from '../models';
import { getFreebuffProviderSettings, updateFreebuffProviderSettings } from '../settings';

const FREEBUFF_ENV_HASH_KEYS = ['FREEBUFF_API_KEY'];

function computeFreebuffEnvHash(envText: string): string {
  const envVars = parseEnvironmentVariables(envText || '');
  return FREEBUFF_ENV_HASH_KEYS
    .filter(key => envVars[key])
    .map(key => `${key}=${envVars[key]}`)
    .sort()
    .join('|');
}

export const freebuffSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(settings: Record<string, unknown>, conversations: Conversation[]): { changed: boolean; invalidatedConversations: Conversation[] } {
    const envText = getRuntimeEnvironmentText(settings, 'freebuff');
    const currentHash = computeFreebuffEnvHash(envText);
    const savedHash = getFreebuffProviderSettings(settings).environmentHash;
    if (currentHash === savedHash) return { changed: false, invalidatedConversations: [] };
    const invalidatedConversations: Conversation[] = [];
    for (const conversation of conversations) {
      if (conversation.providerId === 'freebuff' && conversation.sessionId) {
        conversation.sessionId = null;
        conversation.providerState = undefined;
        invalidatedConversations.push(conversation);
      }
    }
    updateFreebuffProviderSettings(settings, { environmentHash: currentHash });
    return { changed: true, invalidatedConversations };
  },

  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    let changed = false;
    if (typeof settings.model === 'string' && isFreebuffModelSelectionId(settings.model)) {
      const mode = decodeFreebuffModelId(settings.model);
      const normalized = mode ? encodeFreebuffModelId(mode) : settings.model;
      if (normalized !== settings.model) {
        settings.model = normalized;
        changed = true;
      }
    }
    const saved = settings.savedProviderModel;
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const map = saved as Record<string, unknown>;
      const value = map.freebuff;
      if (typeof value === 'string' && isFreebuffModelSelectionId(value)) {
        const mode = decodeFreebuffModelId(value);
        const normalized = mode ? encodeFreebuffModelId(mode) : value;
        if (normalized !== value) {
          map.freebuff = normalized;
          changed = true;
        }
      }
    }
    return changed;
  },
};
