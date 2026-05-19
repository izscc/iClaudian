import type { ProviderRuntimeCommandLoader, ProviderRuntimeCommandLoaderContext } from '../../../core/providers/types';
import { AntigravityChatRuntime } from '../runtime/AntigravityChatRuntime';
import { getAntigravityProviderSettings } from '../settings';

export class AntigravityRuntimeCommandLoader implements ProviderRuntimeCommandLoader {
  isAvailable(settings: Record<string, unknown>): boolean { return getAntigravityProviderSettings(settings).enabled; }
  async loadCommands(context: ProviderRuntimeCommandLoaderContext) {
    const shouldWarmBlankSession = context.allowSessionCreation === true && !context.conversation?.sessionId;
    const shouldWarmPreSessionConversation = !!context.conversation && !context.conversation.sessionId && context.conversation.messages.length > 0;
    if (!context.runtime && !context.conversation?.sessionId && !shouldWarmBlankSession && !shouldWarmPreSessionConversation) return [];
    const canReuseRuntime = context.runtime?.providerId === 'antigravity' && !shouldWarmPreSessionConversation;
    const runtime = canReuseRuntime ? context.runtime! : new AntigravityChatRuntime(context.plugin);
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
