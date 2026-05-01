import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderTabWarmupPolicy, ProviderWorkspaceRegistration, ProviderWorkspaceServices } from '../../../core/providers/types';
import { GeminiCommandCatalog } from '../commands/GeminiCommandCatalog';
import { GeminiCliResolver } from '../runtime/GeminiCliResolver';
import { GeminiChatRuntime } from '../runtime/GeminiChatRuntime';
import { geminiSettingsTabRenderer } from '../ui/GeminiSettingsTab';
import { GeminiRuntimeCommandLoader } from './GeminiRuntimeCommandLoader';

export interface GeminiWorkspaceServices extends ProviderWorkspaceServices {
  commandCatalog: ProviderCommandCatalog;
}

const geminiTabWarmupPolicy: ProviderTabWarmupPolicy = { resolveMode: () => 'commands' };

export async function createGeminiWorkspaceServices(): Promise<GeminiWorkspaceServices> {
  const commandCatalog = new GeminiCommandCatalog();
  GeminiChatRuntime.commandCatalog = commandCatalog;
  return {
    commandCatalog,
    cliResolver: new GeminiCliResolver(),
    runtimeCommandLoader: new GeminiRuntimeCommandLoader(),
    settingsTabRenderer: geminiSettingsTabRenderer,
    tabWarmupPolicy: geminiTabWarmupPolicy,
  };
}

export const geminiWorkspaceRegistration: ProviderWorkspaceRegistration<GeminiWorkspaceServices> = {
  initialize: async () => createGeminiWorkspaceServices(),
};

export function maybeGetGeminiWorkspaceServices(): GeminiWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('gemini') as GeminiWorkspaceServices | null;
}
