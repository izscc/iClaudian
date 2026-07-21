import type ClaudianPlugin from '../../main';
import { HomeFileAdapter } from '../storage/HomeFileAdapter';
import type { ProviderCommandCatalog } from './commands/ProviderCommandCatalog';
import type {
  AgentMentionProvider,
  ProviderCliResolver,
  ProviderId,
  ProviderModelCatalogRefreshResult,
  ProviderRuntimeCommandLoader,
  ProviderSettingsTabRenderer,
  ProviderTabWarmupPolicy,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from './types';

export interface ProviderWorkspaceInitializer {
  readonly providerId: ProviderId;
  initialize(): Promise<ProviderWorkspaceServices>;
}

export async function initializeProviderWorkspaces(
  initializers: readonly ProviderWorkspaceInitializer[],
): Promise<readonly [ProviderId, ProviderWorkspaceServices][]> {
  const results = await Promise.allSettled(initializers.map(async (
    initializer,
  ): Promise<[ProviderId, ProviderWorkspaceServices]> => [
    initializer.providerId,
    await initializer.initialize(),
  ]));
  const initialized = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    await Promise.allSettled(initialized.map(async ([, services]) => services.dispose?.()));
    throw failure.reason;
  }
  return initialized;
}

/**
 * Registry for provider-owned workspace/bootstrap services.
 *
 * Unlike `ProviderRegistry`, this boundary owns app-level provider services such
 * as command catalogs, mention providers, MCP/plugin/agent managers, and
 * provider-specific storage adaptors.
 */
export class ProviderWorkspaceRegistry {
  private static registrations: Partial<Record<ProviderId, ProviderWorkspaceRegistration>> = {};
  private static services: Partial<Record<ProviderId, ProviderWorkspaceServices>> = {};

  static register(
    providerId: ProviderId,
    registration: ProviderWorkspaceRegistration,
  ): void {
    this.registrations[providerId] = registration;
  }

  private static getWorkspaceRegistration(providerId: ProviderId): ProviderWorkspaceRegistration {
    const registration = this.registrations[providerId];
    if (!registration) {
      throw new Error(`Provider workspace "${providerId}" is not registered.`);
    }
    return registration;
  }

  static async initializeAll(plugin: ClaudianPlugin): Promise<void> {
    const providerIds = Object.keys(this.registrations) as ProviderId[];
    const storage = plugin.storage;
    const vaultAdapter = storage.getAdapter();
    const homeAdapter = new HomeFileAdapter();

    const initialized = await initializeProviderWorkspaces(providerIds.map(providerId => ({
      providerId,
      initialize: () => this.getWorkspaceRegistration(providerId).initialize({
        plugin,
        storage,
        vaultAdapter,
        homeAdapter,
      }),
    })));

    const previousServices = Object.values(this.services)
      .filter((service): service is ProviderWorkspaceServices => service !== undefined);
    this.services = Object.fromEntries(initialized) as Partial<
      Record<ProviderId, ProviderWorkspaceServices>
    >;
    await Promise.allSettled(previousServices.map(async services => services.dispose?.()));
  }

  static setServices(
    providerId: ProviderId,
    services: ProviderWorkspaceServices | undefined,
  ): void {
    if (services) {
      this.services[providerId] = services;
    } else {
      delete this.services[providerId];
    }
  }

  static clear(): void {
    this.services = {};
  }

  static async disposeAll(): Promise<void> {
    const services = Object.values(this.services)
      .filter((service): service is ProviderWorkspaceServices => service !== undefined);
    this.services = {};
    await Promise.allSettled(services.map(async service => service.dispose?.()));
  }

  static getServices(
    providerId: ProviderId,
  ): ProviderWorkspaceServices | null {
    return this.services[providerId] ?? null;
  }

  static requireServices(
    providerId: ProviderId,
  ): ProviderWorkspaceServices {
    const services = this.getServices(providerId);
    if (!services) {
      throw new Error(`Provider workspace "${providerId}" is not initialized.`);
    }
    return services;
  }

  static getCommandCatalog(providerId: ProviderId): ProviderCommandCatalog | null {
    return this.getServices(providerId)?.commandCatalog ?? null;
  }

  static getAgentMentionProvider(providerId: ProviderId): AgentMentionProvider | null {
    return this.getServices(providerId)?.agentMentionProvider ?? null;
  }

  static async refreshAgentMentions(providerId: ProviderId): Promise<void> {
    await this.getServices(providerId)?.refreshAgentMentions?.();
  }

  static async refreshModelCatalog(
    providerId: ProviderId,
    force = false,
  ): Promise<ProviderModelCatalogRefreshResult> {
    return this.getServices(providerId)?.refreshModelCatalog?.(force) ?? { changed: false };
  }

  static getCliResolver(providerId: ProviderId): ProviderCliResolver | null {
    return this.getServices(providerId)?.cliResolver ?? null;
  }

  static getRuntimeCommandLoader(providerId: ProviderId): ProviderRuntimeCommandLoader | null {
    return this.getServices(providerId)?.runtimeCommandLoader ?? null;
  }

  static getTabWarmupPolicy(providerId: ProviderId): ProviderTabWarmupPolicy | null {
    return this.getServices(providerId)?.tabWarmupPolicy ?? null;
  }

  static getMcpServerManager(providerId: ProviderId) {
    return this.getServices(providerId)?.mcpServerManager ?? null;
  }

  static getSettingsTabRenderer(providerId: ProviderId): ProviderSettingsTabRenderer | null {
    return this.getServices(providerId)?.settingsTabRenderer ?? null;
  }
}
