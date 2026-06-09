import type {
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderUIOption,
} from '../../../core/providers/types';
import {
  encodeFreebuffModelId,
  FREEBUFF_MODE_OPTIONS,
  FREEBUFF_SYNTHETIC_MODEL_ID,
  isFreebuffModelSelectionId,
} from '../models';
import { updateFreebuffProviderSettings } from '../settings';

const FREEBUFF_ICON: ProviderIconSvg = {
  viewBox: '0 0 24 24',
  path: 'M4 4h16v3H7v4h10v3H7v6H4V4zm13 10h3v6h-3v-6z',
};

const DEFAULT_CONTEXT_WINDOW = 200_000;

const FREEBUFF_MODEL_OPTIONS: ProviderUIOption[] = FREEBUFF_MODE_OPTIONS.map(option => ({
  description: option.description,
  label: option.label,
  value: encodeFreebuffModelId(option.mode),
}));

export const freebuffChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(): ProviderUIOption[] {
    return FREEBUFF_MODEL_OPTIONS;
  },

  ownsModel(model: string): boolean { return isFreebuffModelSelectionId(model); },
  isAdaptiveReasoningModel(): boolean { return false; },
  getReasoningOptions(): ProviderUIOption[] { return []; },
  getDefaultReasoningValue(): string { return ''; },
  getContextWindowSize(model: string, customLimits?: Record<string, number>): number {
    return customLimits?.[model] ?? DEFAULT_CONTEXT_WINDOW;
  },
  isDefaultModel(model: string): boolean { return isFreebuffModelSelectionId(model); },
  applyModelDefaults(model: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    const settingsBag = settings as Record<string, unknown>;
    if (!isFreebuffModelSelectionId(model)) return;
    settingsBag.model = model;
    updateFreebuffProviderSettings(settingsBag, {
      selectedMode: model === FREEBUFF_SYNTHETIC_MODEL_ID
        ? 'freebuff'
        : model.slice('freebuff:'.length) as any,
    });
  },
  normalizeModelVariant(model: string): string { return model; },
  getCustomModelIds(): Set<string> { return new Set(); },
  getProviderIcon() { return FREEBUFF_ICON; },
};
