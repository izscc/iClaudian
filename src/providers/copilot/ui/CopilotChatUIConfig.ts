import type {
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderPermissionModeToggleConfig,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import {
  COPILOT_FALLBACK_MODELS,
  COPILOT_MODEL_PREFIX,
  COPILOT_SYNTHETIC_MODEL_ID,
  decodeCopilotModelId,
  encodeCopilotModelId,
  isCopilotModelSelectionId,
} from '../models';
import { copilotApprovalModeToPermissionMode, permissionModeToCopilotApprovalMode } from '../modes';
import { getCopilotProviderSettings, updateCopilotProviderSettings } from '../settings';

const COPILOT_ICON: ProviderIconSvg = {
  viewBox: '0 0 24 24',
  path: 'M12 2.2a9.8 9.8 0 0 0-9.8 9.8v4.2A3.8 3.8 0 0 0 6 20h2.2v-7.2H4.5V12a7.5 7.5 0 0 1 15 0v.8h-3.7V20H18a3.8 3.8 0 0 0 3.8-3.8V12A9.8 9.8 0 0 0 12 2.2zm-5 12.4v3.6H6a2 2 0 0 1-2-2v-1.6h3zm13 0v1.6a2 2 0 0 1-2 2h-1v-3.6h3z',
};

const DEFAULT_CONTEXT_WINDOW = 200_000;
const COPILOT_DEFAULT_EFFORT = 'high';
const COPILOT_PERMISSION_MODE_TOGGLE: ProviderPermissionModeToggleConfig = {
  inactiveValue: 'normal',
  inactiveLabel: 'Safe',
  activeValue: 'yolo',
  activeLabel: 'YOLO',
  planValue: 'plan',
  planLabel: 'Plan',
};

const FALLBACK_MODELS: ProviderUIOption[] = [
  { value: COPILOT_SYNTHETIC_MODEL_ID, label: 'Copilot', description: 'GitHub Copilot CLI ACP runtime default model' },
  ...COPILOT_FALLBACK_MODELS.map(model => ({
    value: encodeCopilotModelId(model.rawId),
    label: model.label,
    ...(model.description ? { description: model.description } : {}),
  })),
];

const EFFORT_OPTIONS: ProviderReasoningOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' },
];

export const copilotChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(settings): ProviderUIOption[] {
    const copilotSettings = getCopilotProviderSettings(settings);
    const discovered = new Map(copilotSettings.discoveredModels.map((model) => [model.rawId, model]));
    const visible = copilotSettings.visibleModels.length > 0
      ? copilotSettings.visibleModels
      : copilotSettings.discoveredModels.map((model) => model.rawId);
    const options = visible.flatMap((rawId): ProviderUIOption[] => {
      const model = discovered.get(rawId);
      return [{
        value: encodeCopilotModelId(rawId),
        label: model?.label ?? rawId,
        ...(model?.description ? { description: model.description } : {}),
      }];
    });
    return options.length > 0 ? options : FALLBACK_MODELS;
  },

  ownsModel(model: string): boolean { return isCopilotModelSelectionId(model); },
  isAdaptiveReasoningModel(): boolean { return true; },
  getReasoningOptions(): ProviderReasoningOption[] { return EFFORT_OPTIONS; },
  getDefaultReasoningValue(): string { return COPILOT_DEFAULT_EFFORT; },
  getContextWindowSize(model: string, customLimits?: Record<string, number>): number {
    return customLimits?.[model] ?? DEFAULT_CONTEXT_WINDOW;
  },
  isDefaultModel(model: string): boolean { return model === COPILOT_SYNTHETIC_MODEL_ID || model.startsWith(COPILOT_MODEL_PREFIX); },
  applyModelDefaults(model: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    const settingsBag = settings as Record<string, unknown>;
    if (isCopilotModelSelectionId(model)) settingsBag.model = model;
    if (typeof settingsBag.effortLevel !== 'string' || !EFFORT_OPTIONS.some(option => option.value === settingsBag.effortLevel)) {
      settingsBag.effortLevel = COPILOT_DEFAULT_EFFORT;
    }
  },
  applyReasoningSelection(_model: string, value: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    if (EFFORT_OPTIONS.some(option => option.value === value)) {
      (settings as Record<string, unknown>).effortLevel = value;
    }
  },
  normalizeModelVariant(model: string): string { return isCopilotModelSelectionId(model) ? encodeCopilotModelId(decodeCopilotModelId(model) ?? '') : model; },
  getCustomModelIds(): Set<string> { return new Set(); },
  getPermissionModeToggle(): ProviderPermissionModeToggleConfig { return COPILOT_PERMISSION_MODE_TOGGLE; },
  resolvePermissionMode(settings: Record<string, unknown>): string | null {
    return copilotApprovalModeToPermissionMode(getCopilotProviderSettings(settings).selectedApprovalMode);
  },
  applyPermissionMode(value: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    const settingsBag = settings as Record<string, unknown>;
    settingsBag.permissionMode = value;
    updateCopilotProviderSettings(settingsBag, { selectedApprovalMode: permissionModeToCopilotApprovalMode(value) });
  },
  getProviderIcon() { return COPILOT_ICON; },
};

export function normalizeCopilotModelSelection(model: string): string | null {
  if (model === COPILOT_SYNTHETIC_MODEL_ID) return null;
  return decodeCopilotModelId(model);
}
