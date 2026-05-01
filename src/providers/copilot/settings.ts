import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { HostnameCliPaths } from '../../core/types/settings';
import { getHostnameKey } from '../../utils/env';
import { normalizeCopilotRawModelId } from './models';

export type CopilotApprovalMode = 'default' | 'yolo' | 'plan';

export interface CopilotDiscoveredModel {
  description?: string | null;
  label: string;
  rawId: string;
}

export interface CopilotProviderSettings {
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  enabled: boolean;
  environmentHash: string;
  environmentVariables: string;
  selectedApprovalMode: CopilotApprovalMode;
  visibleModels: string[];
  discoveredModels: CopilotDiscoveredModel[];
  autopilot: boolean;
  experimental: boolean;
  remote: boolean;
  enableReasoningSummaries: boolean;
  customAgent: string;
  additionalMcpConfig: string;
  githubMcpTools: string;
  githubMcpToolsets: string;
  allowTools: string;
  denyTools: string;
  availableTools: string;
  allowUrls: string;
  denyUrls: string;
}

export const DEFAULT_COPILOT_PROVIDER_SETTINGS: Readonly<CopilotProviderSettings> = Object.freeze({
  additionalMcpConfig: '',
  allowTools: '',
  allowUrls: '',
  autopilot: false,
  availableTools: '',
  cliPath: '',
  cliPathsByHost: {},
  customAgent: '',
  denyTools: '',
  denyUrls: '',
  discoveredModels: [],
  enableReasoningSummaries: false,
  enabled: false,
  environmentHash: '',
  environmentVariables: '',
  experimental: false,
  githubMcpTools: '',
  githubMcpToolsets: '',
  remote: false,
  selectedApprovalMode: 'default',
  visibleModels: [],
});

function normalizeHostnameCliPaths(value: unknown): HostnameCliPaths {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: HostnameCliPaths = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) result[key] = entry.trim();
  }
  return result;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeCopilotApprovalMode(value: unknown): CopilotApprovalMode {
  return value === 'yolo' || value === 'plan' ? value : 'default';
}

export function normalizeCopilotDiscoveredModels(value: unknown): CopilotDiscoveredModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CopilotDiscoveredModel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const rawId = typeof raw.rawId === 'string' ? normalizeCopilotRawModelId(raw.rawId) : '';
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

export function normalizeCopilotVisibleModels(value: unknown, discoveredModels: CopilotDiscoveredModel[] = []): string[] {
  if (!Array.isArray(value)) return [];
  const aliases = new Map(discoveredModels.map((model) => [model.rawId.toLowerCase(), model.rawId] as const));
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const normalized = aliases.get(trimmed.toLowerCase()) ?? normalizeCopilotRawModelId(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function getCopilotProviderSettings(settings: Record<string, unknown>): CopilotProviderSettings {
  const config = getProviderConfig(settings, 'copilot');
  const discoveredModels = normalizeCopilotDiscoveredModels(config.discoveredModels);
  return {
    additionalMcpConfig: normalizeString(config.additionalMcpConfig),
    allowTools: normalizeString(config.allowTools),
    allowUrls: normalizeString(config.allowUrls),
    autopilot: normalizeBool(config.autopilot),
    availableTools: normalizeString(config.availableTools),
    cliPath: normalizeString(config.cliPath) || DEFAULT_COPILOT_PROVIDER_SETTINGS.cliPath,
    cliPathsByHost: normalizeHostnameCliPaths(config.cliPathsByHost),
    customAgent: normalizeString(config.customAgent),
    denyTools: normalizeString(config.denyTools),
    denyUrls: normalizeString(config.denyUrls),
    discoveredModels,
    enableReasoningSummaries: normalizeBool(config.enableReasoningSummaries),
    enabled: normalizeBool(config.enabled, DEFAULT_COPILOT_PROVIDER_SETTINGS.enabled),
    environmentHash: normalizeString(config.environmentHash),
    environmentVariables: normalizeString(config.environmentVariables)
      || getProviderEnvironmentVariables(settings, 'copilot')
      || DEFAULT_COPILOT_PROVIDER_SETTINGS.environmentVariables,
    experimental: normalizeBool(config.experimental),
    githubMcpTools: normalizeString(config.githubMcpTools),
    githubMcpToolsets: normalizeString(config.githubMcpToolsets),
    remote: normalizeBool(config.remote),
    selectedApprovalMode: normalizeCopilotApprovalMode(config.selectedApprovalMode),
    visibleModels: normalizeCopilotVisibleModels(config.visibleModels, discoveredModels),
  };
}

export function updateCopilotProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<CopilotProviderSettings>,
): CopilotProviderSettings {
  const current = getCopilotProviderSettings(settings);
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

  const nextDiscoveredModels = normalizeCopilotDiscoveredModels(updates.discoveredModels ?? current.discoveredModels);
  const next: CopilotProviderSettings = {
    ...current,
    ...updates,
    cliPath: nextCliPath,
    cliPathsByHost,
    discoveredModels: nextDiscoveredModels,
    selectedApprovalMode: normalizeCopilotApprovalMode(updates.selectedApprovalMode ?? current.selectedApprovalMode),
    visibleModels: normalizeCopilotVisibleModels(updates.visibleModels ?? current.visibleModels, nextDiscoveredModels),
  };

  setProviderConfig(settings, 'copilot', {
    additionalMcpConfig: next.additionalMcpConfig,
    allowTools: next.allowTools,
    allowUrls: next.allowUrls,
    autopilot: next.autopilot,
    availableTools: next.availableTools,
    cliPath: next.cliPath,
    cliPathsByHost: next.cliPathsByHost,
    customAgent: next.customAgent,
    denyTools: next.denyTools,
    denyUrls: next.denyUrls,
    discoveredModels: next.discoveredModels,
    enableReasoningSummaries: next.enableReasoningSummaries,
    enabled: next.enabled,
    environmentHash: next.environmentHash,
    environmentVariables: next.environmentVariables,
    experimental: next.experimental,
    githubMcpTools: next.githubMcpTools,
    githubMcpToolsets: next.githubMcpToolsets,
    remote: next.remote,
    selectedApprovalMode: next.selectedApprovalMode,
    visibleModels: next.visibleModels,
  });
  return next;
}
