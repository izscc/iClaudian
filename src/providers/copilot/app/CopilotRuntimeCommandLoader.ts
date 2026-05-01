import type { ProviderRuntimeCommandLoader, ProviderRuntimeCommandLoaderContext } from '../../../core/providers/types';
import { CopilotChatRuntime } from '../runtime/CopilotChatRuntime';
import { getCopilotProviderSettings } from '../settings';

export class CopilotRuntimeCommandLoader implements ProviderRuntimeCommandLoader {
  isAvailable(settings: Record<string, unknown>): boolean { return getCopilotProviderSettings(settings).enabled; }
  async loadCommands(context: ProviderRuntimeCommandLoaderContext) {
    const shouldWarmBlankSession = context.allowSessionCreation === true && !context.conversation?.sessionId;
    const shouldWarmPreSessionConversation = !!context.conversation && !context.conversation.sessionId && context.conversation.messages.length > 0;
    if (!context.runtime && !context.conversation?.sessionId && !shouldWarmBlankSession && !shouldWarmPreSessionConversation) return [];
    const canReuseRuntime = context.runtime?.providerId === 'copilot' && !shouldWarmPreSessionConversation;
    const runtime = canReuseRuntime ? context.runtime! : new CopilotChatRuntime(context.plugin);
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
