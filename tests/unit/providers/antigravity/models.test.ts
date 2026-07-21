import { createAntigravityWorkspaceServices } from '@/providers/antigravity/app/AntigravityWorkspaceServices';
import { antigravitySettingsReconciler } from '@/providers/antigravity/env/AntigravitySettingsReconciler';
import {
  ANTIGRAVITY_FALLBACK_MODELS,
  decodeAntigravityModelId,
  encodeAntigravityModelId,
} from '@/providers/antigravity/models';
import { getAntigravityProviderSettings, normalizeAntigravityVisibleModels, updateAntigravityProviderSettings } from '@/providers/antigravity/settings';
import { antigravityChatUIConfig } from '@/providers/antigravity/ui/AntigravityChatUIConfig';

describe('Antigravity model aliases', () => {
  it('uses Gemini 3.6 Flash Medium as the built-in fast default', () => {
    expect(ANTIGRAVITY_FALLBACK_MODELS[0].rawId).toBe('gemini-3.6-flash-medium');
    expect(antigravityChatUIConfig.getModelOptions({})[0].label).toBe('Gemini 3.6 Flash (Medium)');
  });

  it('keeps the Gemini 3.6 fallback ahead of a stale discovered catalog', () => {
    const options = antigravityChatUIConfig.getModelOptions({
      providerConfigs: {
        antigravity: {
          discoveredModels: [{ label: 'Gemini 3.5 Flash (Medium)', rawId: 'Gemini 3.5 Flash (Medium)' }],
        },
      },
    });

    expect(options[0]?.value).toBe('antigravity:gemini-3.6-flash-medium');
    expect(options.some(option => option.value === 'antigravity:gemini-3.5-flash-medium')).toBe(true);
  });

  it('normalizes legacy saved selections without changing the chosen model', () => {
    const settings: Record<string, unknown> = {
      model: 'antigravity:Gemini 3.5 Flash (Medium)',
      savedProviderModel: { antigravity: 'antigravity:Gemini 3.5 Flash (Medium)' },
      titleGenerationModel: 'antigravity:Gemini 3.5 Flash (Medium)',
    };

    expect(antigravitySettingsReconciler.normalizeModelVariantSettings(settings)).toBe(true);
    expect(settings.model).toBe('antigravity:gemini-3.5-flash-medium');
    expect(settings.savedProviderModel).toEqual({ antigravity: 'antigravity:gemini-3.5-flash-medium' });
    expect(settings.titleGenerationModel).toBe('antigravity:gemini-3.5-flash-medium');
  });

  it('prewarms blank Antigravity tabs by default', () => {
    expect((getAntigravityProviderSettings({}) as any).enableBlankTabPrewarm).toBe(true);
  });

  it('lets users disable Antigravity blank-tab prewarm', async () => {
    const settings: Record<string, unknown> = {};
    updateAntigravityProviderSettings(settings, { enableBlankTabPrewarm: false });
    const services = await createAntigravityWorkspaceServices();

    expect(services.tabWarmupPolicy?.resolveMode({
      conversation: null,
      externalContextPaths: [],
      plugin: { settings } as any,
      runtime: null,
      tab: {
        conversationId: null,
        draftModel: 'antigravity:gemini-3.6-flash-medium',
        lifecycleState: 'blank',
        providerId: 'antigravity',
      },
    })).toBe('none');
  });

  it('normalizes legacy display labels to the canonical CLI model IDs', () => {
    expect(encodeAntigravityModelId('Gemini 3.6 Flash (Medium)')).toBe('antigravity:gemini-3.6-flash-medium');
    expect(decodeAntigravityModelId('antigravity:Gemini 3.5 Flash (Low)')).toBe('gemini-3.5-flash-low');
    expect(normalizeAntigravityVisibleModels(['Gemini 3.5 Flash (High)'])).toEqual(['gemini-3.5-flash-high']);
  });

  it('maps internal Antigravity runtime model identifiers to visible CLI model labels', () => {
    expect(decodeAntigravityModelId('antigravity:gemini-3-flash-agent')).toBe('gemini-3.5-flash-high');
    expect(decodeAntigravityModelId('antigravity:claude-sonnet-4-6@default')).toBe('claude-sonnet-4-6');
    expect(decodeAntigravityModelId('antigravity:openai/gpt-oss-120b-maas')).toBe('gpt-oss-120b-medium');
  });
});
