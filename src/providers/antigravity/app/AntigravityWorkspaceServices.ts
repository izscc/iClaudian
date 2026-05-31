import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderTabWarmupPolicy, ProviderWorkspaceRegistration, ProviderWorkspaceServices } from '../../../core/providers/types';
import { AntigravityCommandCatalog } from '../commands/AntigravityCommandCatalog';
import { AntigravityChatRuntime } from '../runtime/AntigravityChatRuntime';
import { AntigravityCliResolver } from '../runtime/AntigravityCliResolver';
import { getAntigravityProviderSettings } from '../settings';
import { antigravitySettingsTabRenderer } from '../ui/AntigravitySettingsTab';
import { AntigravityRuntimeCommandLoader } from './AntigravityRuntimeCommandLoader';

export interface AntigravityWorkspaceServices extends ProviderWorkspaceServices {
  commandCatalog: ProviderCommandCatalog;
}

const antigravityTabWarmupPolicy: ProviderTabWarmupPolicy = {
  resolveMode: (context) => {
    const settings = getAntigravityProviderSettings(context.plugin.settings as unknown as Record<string, unknown>);
    return settings.enableBlankTabPrewarm ? 'commands' : 'none';
  },
};

export async function createAntigravityWorkspaceServices(): Promise<AntigravityWorkspaceServices> {
  const commandCatalog = new AntigravityCommandCatalog();
  AntigravityChatRuntime.commandCatalog = commandCatalog;
  return {
    commandCatalog,
    cliResolver: new AntigravityCliResolver(),
    runtimeCommandLoader: new AntigravityRuntimeCommandLoader(),
    settingsTabRenderer: antigravitySettingsTabRenderer,
    tabWarmupPolicy: antigravityTabWarmupPolicy,
  };
}

export const antigravityWorkspaceRegistration: ProviderWorkspaceRegistration<AntigravityWorkspaceServices> = {
  initialize: async () => createAntigravityWorkspaceServices(),
};

export function maybeGetAntigravityWorkspaceServices(): AntigravityWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('antigravity') as AntigravityWorkspaceServices | null;
}
