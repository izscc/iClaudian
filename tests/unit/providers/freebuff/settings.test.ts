import {
  getFreebuffProviderSettings,
  updateFreebuffProviderSettings,
} from '@/providers/freebuff/settings';

describe('freebuff provider settings', () => {
  it('returns disabled defaults', () => {
    expect(getFreebuffProviderSettings({})).toMatchObject({
      cliPath: '',
      cliPathsByHost: {},
      enabled: false,
      environmentVariables: '',
      selectedMode: 'minimax-m2.7',
    });
  });

  it('normalizes invalid selected models back to the default Freebuff model', () => {
    const settings = {
      providerConfigs: {
        freebuff: {
          selectedMode: 'unknown',
        },
      },
    };

    expect(getFreebuffProviderSettings(settings).selectedMode).toBe('minimax-m2.7');
  });

  it('persists updates in providerConfigs', () => {
    const settings: Record<string, unknown> = {};

    updateFreebuffProviderSettings(settings, {
      enabled: true,
      environmentVariables: 'FREEBUFF_API_KEY=test',
      selectedMode: 'deepseek-v4-pro',
    });

    expect(getFreebuffProviderSettings(settings)).toMatchObject({
      enabled: true,
      environmentVariables: 'FREEBUFF_API_KEY=test',
      selectedMode: 'deepseek-v4-pro',
    });
  });
});
