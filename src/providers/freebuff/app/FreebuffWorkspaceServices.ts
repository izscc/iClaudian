import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderWorkspaceRegistration, ProviderWorkspaceServices } from '../../../core/providers/types';
import { FreebuffCliResolver } from '../runtime/FreebuffCliResolver';
import { freebuffSettingsTabRenderer } from '../ui/FreebuffSettingsTab';

export type FreebuffWorkspaceServices = ProviderWorkspaceServices;

export async function createFreebuffWorkspaceServices(): Promise<FreebuffWorkspaceServices> {
  return {
    cliResolver: new FreebuffCliResolver(),
    settingsTabRenderer: freebuffSettingsTabRenderer,
  };
}

export const freebuffWorkspaceRegistration: ProviderWorkspaceRegistration<FreebuffWorkspaceServices> = {
  initialize: async () => createFreebuffWorkspaceServices(),
};

export function maybeGetFreebuffWorkspaceServices(): FreebuffWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('freebuff') as FreebuffWorkspaceServices | null;
}
