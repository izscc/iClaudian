import { formatCodexModelLabel } from './types/models';

export interface CodexReasoningEffortOption {
  readonly value: string;
  readonly description: string;
}

export interface CodexModelServiceTier {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface CodexDiscoveredModel {
  readonly model: string;
  readonly displayName: string;
  readonly description: string;
  readonly supportedReasoningEfforts: readonly CodexReasoningEffortOption[];
  readonly defaultReasoningEffort: string;
  readonly serviceTiers: readonly CodexModelServiceTier[];
  readonly defaultServiceTier: string | null;
  readonly inputModalities: readonly ('text' | 'image')[];
  readonly isDefault: boolean;
}

function normalizeServiceTiers(value: unknown): CodexModelServiceTier[] {
  if (!Array.isArray(value)) return [];

  const tiers: CodexModelServiceTier[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = normalizeNonEmptyString(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tiers.push({
      id,
      name: normalizeNonEmptyString(entry.name) ?? id,
      description: normalizeNonEmptyString(entry.description) ?? '',
    });
  }
  return tiers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeReasoningEfforts(value: unknown): CodexReasoningEffortOption[] {
  if (!Array.isArray(value)) return [];

  const efforts: CodexReasoningEffortOption[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const effort = normalizeNonEmptyString(entry.value ?? entry.reasoningEffort);
    if (!effort || seen.has(effort)) {
      continue;
    }
    seen.add(effort);
    efforts.push({
      value: effort,
      description: normalizeNonEmptyString(entry.description) ?? '',
    });
  }
  return efforts;
}

function normalizeInputModalities(value: unknown): Array<'text' | 'image'> {
  if (!Array.isArray(value)) return ['text', 'image'];
  const modalities = new Set<'text' | 'image'>();
  for (const entry of value) {
    if (entry === 'text' || entry === 'image') modalities.add(entry);
  }
  return [...modalities];
}

function resolveDefaultReasoningEffort(
  rawDefault: string | null,
  options: readonly CodexReasoningEffortOption[],
): string | null {
  if (rawDefault && options.some(option => option.value === rawDefault)) return rawDefault;
  return null;
}

export function normalizeCodexDiscoveredModels(value: unknown): CodexDiscoveredModel[] {
  if (!Array.isArray(value)) return [];

  const models: CodexDiscoveredModel[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || entry.hidden === true) continue;
    const model = normalizeNonEmptyString(entry.model ?? entry.id);
    if (!model || seen.has(model)) continue;

    const supportedReasoningEfforts = normalizeReasoningEfforts(entry.supportedReasoningEfforts);
    const defaultReasoningEffort = resolveDefaultReasoningEffort(
      normalizeNonEmptyString(entry.defaultReasoningEffort),
      supportedReasoningEfforts,
    );
    if (!defaultReasoningEffort) continue;
    const serviceTiers = normalizeServiceTiers(entry.serviceTiers);
    const defaultServiceTier = normalizeNonEmptyString(entry.defaultServiceTier);

    seen.add(model);
    models.push({
      model,
      displayName: normalizeNonEmptyString(entry.displayName) ?? formatCodexModelLabel(model),
      description: normalizeNonEmptyString(entry.description) ?? '',
      supportedReasoningEfforts,
      defaultReasoningEffort,
      serviceTiers,
      defaultServiceTier,
      inputModalities: normalizeInputModalities(entry.inputModalities),
      isDefault: entry.isDefault === true,
    });
  }
  return models;
}

export function getCodexModelsInPickerOrder(
  models: readonly CodexDiscoveredModel[],
): CodexDiscoveredModel[] {
  return [...models].reverse();
}

export function getCodexFastServiceTier(
  model: CodexDiscoveredModel,
): CodexModelServiceTier | null {
  return model.serviceTiers.find(tier => tier.name.trim().toLowerCase() === 'fast') ?? null;
}

export function findCodexModel(
  models: readonly CodexDiscoveredModel[],
  modelId: string | undefined,
): CodexDiscoveredModel | null {
  if (!modelId) return null;
  return models.find(model => model.model === modelId) ?? null;
}

export function getDefaultCodexModel(
  models: readonly CodexDiscoveredModel[],
): CodexDiscoveredModel | null {
  return models.find(model => model.isDefault) ?? models[0] ?? null;
}
