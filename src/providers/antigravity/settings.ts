import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { HostnameCliPaths } from '../../core/types/settings';
import { getHostnameKey } from '../../utils/env';
import { normalizeAntigravityRawModelId } from './models';

export type AntigravityApprovalMode = 'default' | 'auto_edit' | 'yolo' | 'plan';

export interface AntigravityDiscoveredModel {
  description?: string | null;
  label: string;
  rawId: string;
}

export interface AntigravityProviderSettings {
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  enabled: boolean;
  environmentHash: string;
  environmentVariables: string;
  selectedApprovalMode: AntigravityApprovalMode;
  visibleModels: string[];
  discoveredModels: AntigravityDiscoveredModel[];
}

export const DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS: Readonly<AntigravityProviderSettings> = Object.freeze({
  cliPath: '',
  cliPathsByHost: {},
  enabled: false,
  environmentHash: '',
  environmentVariables: '',
  selectedApprovalMode: 'default',
  visibleModels: [],
  discoveredModels: [],
});

function normalizeHostnameCliPaths(value: unknown): HostnameCliPaths {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: HostnameCliPaths = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) result[key] = entry.trim();
  }
  return result;
}

export function normalizeAntigravityApprovalMode(value: unknown): AntigravityApprovalMode {
  return value === 'auto_edit' || value === 'yolo' || value === 'plan' ? value : 'default';
}

export function normalizeAntigravityDiscoveredModels(value: unknown): AntigravityDiscoveredModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: AntigravityDiscoveredModel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const rawId = typeof raw.rawId === 'string' ? normalizeAntigravityRawModelId(raw.rawId) : '';
    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : rawId;
    if (!rawId || seen.has(rawId)) continue;
    seen.add(rawId);
    result.push({
      rawId,
      label,
      ...(typeof raw.description === 'string' && raw.description.trim() ? { description: raw.description.trim() } : {}),
    });
  }
  return result;
}

export function normalizeAntigravityVisibleModels(value: unknown, discoveredModels: AntigravityDiscoveredModel[] = []): string[] {
  if (!Array.isArray(value)) return [];
  const aliases = new Map(discoveredModels.map((model) => [model.rawId.toLowerCase(), model.rawId] as const));
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const normalized = aliases.get(trimmed.toLowerCase()) ?? normalizeAntigravityRawModelId(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function getAntigravityProviderSettings(settings: Record<string, unknown>): AntigravityProviderSettings {
  const config = getProviderConfig(settings, 'antigravity');
  const discoveredModels = normalizeAntigravityDiscoveredModels(config.discoveredModels);
  return {
    cliPath: (config.cliPath as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.cliPath,
    cliPathsByHost: normalizeHostnameCliPaths(config.cliPathsByHost),
    enabled: (config.enabled as boolean | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.enabled,
    environmentHash: (config.environmentHash as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.environmentHash,
    environmentVariables: (config.environmentVariables as string | undefined)
      ?? getProviderEnvironmentVariables(settings, 'antigravity')
      ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.environmentVariables,
    selectedApprovalMode: normalizeAntigravityApprovalMode(config.selectedApprovalMode),
    visibleModels: normalizeAntigravityVisibleModels(config.visibleModels, discoveredModels),
    discoveredModels,
  };
}

export function updateAntigravityProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<AntigravityProviderSettings>,
): AntigravityProviderSettings {
  const current = getAntigravityProviderSettings(settings);
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

  const nextDiscoveredModels = normalizeAntigravityDiscoveredModels(updates.discoveredModels ?? current.discoveredModels);
  const next: AntigravityProviderSettings = {
    ...current,
    ...updates,
    cliPath: nextCliPath,
    cliPathsByHost,
    discoveredModels: nextDiscoveredModels,
    selectedApprovalMode: normalizeAntigravityApprovalMode(updates.selectedApprovalMode ?? current.selectedApprovalMode),
    visibleModels: normalizeAntigravityVisibleModels(updates.visibleModels ?? current.visibleModels, nextDiscoveredModels),
  };

  setProviderConfig(settings, 'antigravity', {
    cliPath: next.cliPath,
    cliPathsByHost: next.cliPathsByHost,
    enabled: next.enabled,
    environmentHash: next.environmentHash,
    environmentVariables: next.environmentVariables,
    selectedApprovalMode: next.selectedApprovalMode,
    visibleModels: next.visibleModels,
    discoveredModels: next.discoveredModels,
  });
  return next;
}
