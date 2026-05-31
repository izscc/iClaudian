import type {
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderPermissionModeToggleConfig,
  ProviderUIOption,
} from '../../../core/providers/types';
import { ANTIGRAVITY_FALLBACK_MODELS, ANTIGRAVITY_MODEL_PREFIX, ANTIGRAVITY_SYNTHETIC_MODEL_ID, decodeAntigravityModelId, encodeAntigravityModelId, isAntigravityModelSelectionId } from '../models';
import { antigravityApprovalModeToPermissionMode, permissionModeToAntigravityApprovalMode } from '../modes';
import { getAntigravityProviderSettings, updateAntigravityProviderSettings } from '../settings';

const ANTIGRAVITY_ICON: ProviderIconSvg = {
  viewBox: '0 0 24 24',
  path: 'M12 2l1.95 6.05L20 10l-6.05 1.95L12 18l-1.95-6.05L4 10l6.05-1.95L12 2zm6 10l.9 2.1L21 15l-2.1.9L18 18l-.9-2.1L15 15l2.1-.9L18 12zM6 14l1.05 2.95L10 18l-2.95 1.05L6 22l-1.05-2.95L2 18l2.95-1.05L6 14z',
};

const DEFAULT_CONTEXT_WINDOW = 1_000_000;
const ANTIGRAVITY_PERMISSION_MODE_TOGGLE: ProviderPermissionModeToggleConfig = {
  inactiveValue: 'normal',
  inactiveLabel: 'Safe',
  activeValue: 'yolo',
  activeLabel: 'YOLO',
  planValue: 'plan',
  planLabel: 'Plan',
};

const FALLBACK_MODELS: ProviderUIOption[] = [
  ...ANTIGRAVITY_FALLBACK_MODELS.map(model => ({
    value: encodeAntigravityModelId(model.rawId),
    label: model.label,
    ...(model.description ? { description: model.description } : {}),
  })),
  { value: ANTIGRAVITY_SYNTHETIC_MODEL_ID, label: 'Antigravity', description: 'Antigravity CLI default model' },
];

export const antigravityChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(settings): ProviderUIOption[] {
    const antigravitySettings = getAntigravityProviderSettings(settings);
    const discovered = new Map(antigravitySettings.discoveredModels.map((model) => [model.rawId, model]));
    const visible = antigravitySettings.visibleModels.length > 0
      ? antigravitySettings.visibleModels
      : antigravitySettings.discoveredModels.map((model) => model.rawId);
    const options = visible.flatMap((rawId): ProviderUIOption[] => {
      const model = discovered.get(rawId);
      return [{
        value: encodeAntigravityModelId(rawId),
        label: model?.label ?? rawId,
        ...(model?.description ? { description: model.description } : {}),
      }];
    });
    return options.length > 0 ? options : FALLBACK_MODELS;
  },

  ownsModel(model: string): boolean { return isAntigravityModelSelectionId(model); },
  isAdaptiveReasoningModel(): boolean { return false; },
  getReasoningOptions(): ProviderUIOption[] {
    return [];
  },
  getDefaultReasoningValue(): string { return ''; },
  getContextWindowSize(model: string, customLimits?: Record<string, number>): number {
    return customLimits?.[model] ?? DEFAULT_CONTEXT_WINDOW;
  },
  isDefaultModel(model: string): boolean { return model === ANTIGRAVITY_SYNTHETIC_MODEL_ID || model.startsWith(ANTIGRAVITY_MODEL_PREFIX); },
  applyModelDefaults(model: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    const settingsBag = settings as Record<string, unknown>;
    if (isAntigravityModelSelectionId(model)) settingsBag.model = model;
  },
  normalizeModelVariant(model: string): string { return model; },
  getCustomModelIds(): Set<string> { return new Set(); },
  getPermissionModeToggle(): ProviderPermissionModeToggleConfig { return ANTIGRAVITY_PERMISSION_MODE_TOGGLE; },
  resolvePermissionMode(settings: Record<string, unknown>): string | null {
    return antigravityApprovalModeToPermissionMode(getAntigravityProviderSettings(settings).selectedApprovalMode);
  },
  applyPermissionMode(value: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    const settingsBag = settings as Record<string, unknown>;
    settingsBag.permissionMode = value;
    updateAntigravityProviderSettings(settingsBag, { selectedApprovalMode: permissionModeToAntigravityApprovalMode(value) });
  },
  getProviderIcon() { return ANTIGRAVITY_ICON; },
};

export function normalizeAntigravityModelSelection(model: string): string | null {
  if (model === ANTIGRAVITY_SYNTHETIC_MODEL_ID) return null;
  return decodeAntigravityModelId(model);
}
