import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderTabWarmupPolicy, ProviderWorkspaceRegistration, ProviderWorkspaceServices } from '../../../core/providers/types';
import { CopilotCommandCatalog } from '../commands/CopilotCommandCatalog';
import { CopilotChatRuntime } from '../runtime/CopilotChatRuntime';
import { CopilotCliResolver } from '../runtime/CopilotCliResolver';
import { copilotSettingsTabRenderer } from '../ui/CopilotSettingsTab';
import { CopilotRuntimeCommandLoader } from './CopilotRuntimeCommandLoader';

export interface CopilotWorkspaceServices extends ProviderWorkspaceServices {
  commandCatalog: ProviderCommandCatalog;
}

const copilotTabWarmupPolicy: ProviderTabWarmupPolicy = { resolveMode: () => 'commands' };

export async function createCopilotWorkspaceServices(): Promise<CopilotWorkspaceServices> {
  const commandCatalog = new CopilotCommandCatalog();
  CopilotChatRuntime.commandCatalog = commandCatalog;
  return {
    commandCatalog,
    cliResolver: new CopilotCliResolver(),
    runtimeCommandLoader: new CopilotRuntimeCommandLoader(),
    settingsTabRenderer: copilotSettingsTabRenderer,
    tabWarmupPolicy: copilotTabWarmupPolicy,
  };
}

export const copilotWorkspaceRegistration: ProviderWorkspaceRegistration<CopilotWorkspaceServices> = {
  initialize: async () => createCopilotWorkspaceServices(),
};

export function maybeGetCopilotWorkspaceServices(): CopilotWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('copilot') as CopilotWorkspaceServices | null;
}
