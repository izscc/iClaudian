import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { getGeminiProviderSettings, updateGeminiProviderSettings } from '../settings';

const GEMINI_ENV_HASH_KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI'];

function computeGeminiEnvHash(envText: string): string {
  const envVars = parseEnvironmentVariables(envText || '');
  return GEMINI_ENV_HASH_KEYS.filter(key => envVars[key]).map(key => `${key}=${envVars[key]}`).sort().join('|');
}

export const geminiSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(settings: Record<string, unknown>, conversations: Conversation[]): { changed: boolean; invalidatedConversations: Conversation[] } {
    const envText = getRuntimeEnvironmentText(settings, 'gemini');
    const currentHash = computeGeminiEnvHash(envText);
    const savedHash = getGeminiProviderSettings(settings).environmentHash;
    if (currentHash === savedHash) return { changed: false, invalidatedConversations: [] };
    const invalidatedConversations: Conversation[] = [];
    for (const conversation of conversations) {
      if (conversation.providerId === 'gemini' && conversation.sessionId) {
        conversation.sessionId = null;
        conversation.providerState = undefined;
        invalidatedConversations.push(conversation);
      }
    }
    updateGeminiProviderSettings(settings, { environmentHash: currentHash });
    return { changed: true, invalidatedConversations };
  },
  normalizeModelVariantSettings(): boolean { return false; },
};
