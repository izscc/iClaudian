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
      selectedMode: 'freebuff',
    });
  });

  it('normalizes invalid selected modes back to freebuff', () => {
    const settings = {
      providerConfigs: {
        freebuff: {
          selectedMode: 'unknown',
        },
      },
    };

    expect(getFreebuffProviderSettings(settings).selectedMode).toBe('freebuff');
  });

  it('persists updates in providerConfigs', () => {
    const settings: Record<string, unknown> = {};

    updateFreebuffProviderSettings(settings, {
      enabled: true,
      environmentVariables: 'CODEBUFF_API_KEY=test',
      selectedMode: 'codebuff-plan',
    });

    expect(getFreebuffProviderSettings(settings)).toMatchObject({
      enabled: true,
      environmentVariables: 'CODEBUFF_API_KEY=test',
      selectedMode: 'codebuff-plan',
    });
  });
});
