import { createAntigravityWorkspaceServices } from '@/providers/antigravity/app/AntigravityWorkspaceServices';
import {
  ANTIGRAVITY_FALLBACK_MODELS,
  decodeAntigravityModelId,
  encodeAntigravityModelId,
} from '@/providers/antigravity/models';
import { getAntigravityProviderSettings, normalizeAntigravityVisibleModels, updateAntigravityProviderSettings } from '@/providers/antigravity/settings';
import { antigravityChatUIConfig } from '@/providers/antigravity/ui/AntigravityChatUIConfig';

describe('Antigravity model aliases', () => {
  it('uses Gemini 3.5 Flash Medium as the built-in fast default', () => {
    expect(ANTIGRAVITY_FALLBACK_MODELS[0].rawId).toBe('Gemini 3.5 Flash (Medium)');
    expect(antigravityChatUIConfig.getModelOptions({})[0].label).toBe('Gemini 3.5 Flash (Medium)');
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
        draftModel: 'antigravity:Gemini 3.5 Flash (Medium)',
        lifecycleState: 'blank',
        providerId: 'antigravity',
      },
    })).toBe('none');
  });

  it('normalizes the removed Gemini 3.5 Flash Low label to the real Medium label', () => {
    expect(encodeAntigravityModelId('Gemini 3.5 Flash (Low)')).toBe('antigravity:Gemini 3.5 Flash (Medium)');
    expect(decodeAntigravityModelId('antigravity:gemini-3.5-flash-low')).toBe('Gemini 3.5 Flash (Medium)');
    expect(normalizeAntigravityVisibleModels(['Gemini 3.5 Flash (Low)'])).toEqual(['Gemini 3.5 Flash (Medium)']);
  });

  it('maps internal Antigravity runtime model identifiers to visible CLI model labels', () => {
    expect(decodeAntigravityModelId('antigravity:gemini-3-flash-agent')).toBe('Gemini 3.5 Flash (High)');
    expect(decodeAntigravityModelId('antigravity:claude-sonnet-4-6@default')).toBe('Claude Sonnet 4.6 (Thinking)');
    expect(decodeAntigravityModelId('antigravity:openai/gpt-oss-120b-maas')).toBe('GPT-OSS 120B (Medium)');
  });
});
