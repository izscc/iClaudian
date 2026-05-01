import type { ProviderRuntimeCommandLoader, ProviderRuntimeCommandLoaderContext } from '../../../core/providers/types';
import { GeminiChatRuntime } from '../runtime/GeminiChatRuntime';
import { getGeminiProviderSettings } from '../settings';

export class GeminiRuntimeCommandLoader implements ProviderRuntimeCommandLoader {
  isAvailable(settings: Record<string, unknown>): boolean { return getGeminiProviderSettings(settings).enabled; }
  async loadCommands(context: ProviderRuntimeCommandLoaderContext) {
    const shouldWarmBlankSession = context.allowSessionCreation === true && !context.conversation?.sessionId;
    const shouldWarmPreSessionConversation = !!context.conversation && !context.conversation.sessionId && context.conversation.messages.length > 0;
    if (!context.runtime && !context.conversation?.sessionId && !shouldWarmBlankSession && !shouldWarmPreSessionConversation) return [];
    const canReuseRuntime = context.runtime?.providerId === 'gemini' && !shouldWarmPreSessionConversation;
    const runtime = canReuseRuntime ? context.runtime! : new GeminiChatRuntime(context.plugin);
    try {
      if (context.conversation) runtime.syncConversationState(context.conversation, context.externalContextPaths);
      const ready = await runtime.ensureReady({ allowSessionCreation: shouldWarmBlankSession || shouldWarmPreSessionConversation });
      if (!ready) return [];
      return await runtime.getSupportedCommands();
    } finally {
      if (runtime !== context.runtime) runtime.cleanup();
    }
  }
}
