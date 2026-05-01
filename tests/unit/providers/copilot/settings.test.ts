import { encodeCopilotModelId } from '@/providers/copilot/models';
import { getCopilotProviderSettings, normalizeCopilotVisibleModels, updateCopilotProviderSettings } from '@/providers/copilot/settings';

describe('Copilot settings', () => {
  it('normalizes legacy copilot/model prefixes in visible models', () => {
    expect(normalizeCopilotVisibleModels(['copilot/gpt-5.4-mini', 'gpt-5.2'])).toEqual([
      'gpt-5.4-mini',
      'gpt-5.2',
    ]);
    expect(encodeCopilotModelId('copilot/gpt-5.4-mini')).toBe('copilot:gpt-5.4-mini');
  });

  it('persists advanced Copilot CLI launch settings', () => {
    const settings: Record<string, unknown> = {};
    const next = updateCopilotProviderSettings(settings, {
      additionalMcpConfig: '@/tmp/mcp.json',
      allowTools: 'write',
      autopilot: true,
      customAgent: 'reviewer',
      enabled: true,
      experimental: true,
      visibleModels: ['copilot/gpt-5.4-mini'],
    });

    expect(next).toMatchObject({
      additionalMcpConfig: '@/tmp/mcp.json',
      allowTools: 'write',
      autopilot: true,
      customAgent: 'reviewer',
      enabled: true,
      experimental: true,
      visibleModels: ['gpt-5.4-mini'],
    });
    expect(getCopilotProviderSettings(settings).visibleModels).toEqual(['gpt-5.4-mini']);
  });
});
