import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { HostnameCliPaths } from '../../core/types/settings';
import { getHostnameKey } from '../../utils/env';
import { type FreebuffModelId,normalizeFreebuffModelId } from './models';

export interface FreebuffProviderSettings {
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  enabled: boolean;
  environmentHash: string;
  environmentVariables: string;
  selectedMode: FreebuffModelId;
}

export const DEFAULT_FREEBUFF_PROVIDER_SETTINGS: Readonly<FreebuffProviderSettings> = Object.freeze({
  cliPath: '',
  cliPathsByHost: {},
  enabled: false,
  environmentHash: '',
  environmentVariables: '',
  selectedMode: 'minimax-m2.7',
});

function normalizeHostnameCliPaths(value: unknown): HostnameCliPaths {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: HostnameCliPaths = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) result[key] = entry.trim();
  }
  return result;
}

export function getFreebuffProviderSettings(settings: Record<string, unknown>): FreebuffProviderSettings {
  const config = getProviderConfig(settings, 'freebuff');
  return {
    cliPath: (config.cliPath as string | undefined) ?? DEFAULT_FREEBUFF_PROVIDER_SETTINGS.cliPath,
    cliPathsByHost: normalizeHostnameCliPaths(config.cliPathsByHost),
    enabled: (config.enabled as boolean | undefined) ?? DEFAULT_FREEBUFF_PROVIDER_SETTINGS.enabled,
    environmentHash: (config.environmentHash as string | undefined) ?? DEFAULT_FREEBUFF_PROVIDER_SETTINGS.environmentHash,
    environmentVariables: (config.environmentVariables as string | undefined)
      ?? getProviderEnvironmentVariables(settings, 'freebuff')
      ?? DEFAULT_FREEBUFF_PROVIDER_SETTINGS.environmentVariables,
    selectedMode: normalizeFreebuffModelId(config.selectedMode),
  };
}

export function updateFreebuffProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<FreebuffProviderSettings>,
): FreebuffProviderSettings {
  const current = getFreebuffProviderSettings(settings);
  const hostnameKey = getHostnameKey();
  const cliPathsByHost = 'cliPathsByHost' in updates
    ? normalizeHostnameCliPaths(updates.cliPathsByHost)
    : { ...current.cliPathsByHost };
  let nextCliPath = 'cliPathsByHost' in updates ? '' : current.cliPath.trim();

  if ('cliPath' in updates) {
    const trimmed = typeof updates.cliPath === 'string' ? updates.cliPath.trim() : '';
    if (trimmed) cliPathsByHost[hostnameKey] = trimmed;
    else delete cliPathsByHost[hostnameKey];
    nextCliPath = '';
  }

  const next: FreebuffProviderSettings = {
    ...current,
    ...updates,
    cliPath: nextCliPath,
    cliPathsByHost,
    selectedMode: normalizeFreebuffModelId(updates.selectedMode ?? current.selectedMode),
  };

  setProviderConfig(settings, 'freebuff', {
    cliPath: next.cliPath,
    cliPathsByHost: next.cliPathsByHost,
    enabled: next.enabled,
    environmentHash: next.environmentHash,
    environmentVariables: next.environmentVariables,
    selectedMode: next.selectedMode,
  });
  return next;
}
