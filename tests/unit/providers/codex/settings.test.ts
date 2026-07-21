import {
  applyCodexModelDefaults,
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  getCodexProviderSettings,
  getEffectiveCodexReasoningSummary,
  updateCodexProviderSettings,
} from '@/providers/codex/settings';
import { CODEX_SPARK_MODEL } from '@/providers/codex/types/models';

const mockGetHostnameKey = jest.fn(() => 'host-a');

jest.mock('@/utils/env', () => ({
  getHostnameKey: () => mockGetHostnameKey(),
}));

describe('codex settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-finite and far-future catalog timestamps', () => {
    const future = Date.now() + 60 * 60 * 1_000;

    expect(getCodexProviderSettings({
      providerConfigs: { codex: { catalogTimestamp: Number.POSITIVE_INFINITY } },
    }).catalogTimestamp).toBe(0);
    expect(getCodexProviderSettings({
      providerConfigs: { codex: { catalogTimestamp: future } },
    }).catalogTimestamp).toBe(0);
  });

  it('defaults installationMethod to native-windows and leaves wslDistroOverride empty', () => {
    const settings = getCodexProviderSettings({});

    expect(settings.customModels).toBe('');
    expect(settings.discoveredModels).toEqual([]);
    expect(settings.catalogTimestamp).toBe(0);
    expect(settings.installationMethod).toBe('native-windows');
    expect(settings.wslDistroOverride).toBe('');
    expect(settings.installationMethod).toBe(DEFAULT_CODEX_PROVIDER_SETTINGS.installationMethod);
    expect(settings.wslDistroOverride).toBe(DEFAULT_CODEX_PROVIDER_SETTINGS.wslDistroOverride);
  });

  it('normalizes and persists a discovered model catalog', () => {
    const settingsBag: Record<string, unknown> = {};

    updateCodexProviderSettings(settingsBag, {
      discoveredModels: [{
        model: 'gpt-5.6-sol',
        displayName: 'GPT-5.6 Sol',
        description: 'Frontier',
        supportedReasoningEfforts: [{ value: 'high', description: 'Deep' }],
        defaultReasoningEffort: 'high',
        serviceTiers: [],
        defaultServiceTier: null,
        inputModalities: ['text'],
        isDefault: true,
      }],
      catalogTimestamp: 123,
    });

    expect(getCodexProviderSettings(settingsBag)).toMatchObject({
      discoveredModels: [expect.objectContaining({ model: 'gpt-5.6-sol' })],
      catalogTimestamp: 123,
    });
  });

  it('normalizes invalid installationMethod and wslDistroOverride values', () => {
    const settings = getCodexProviderSettings({
      providerConfigs: {
        codex: {
          installationMethod: 'auto',
          wslDistroOverride: 123,
        },
      },
    });

    expect(settings.installationMethod).toBe('native-windows');
    expect(settings.wslDistroOverride).toBe('');
  });

  it('does not inherit another host installation method once host-scoped values exist', () => {
    const settings = getCodexProviderSettings({
      providerConfigs: {
        codex: {
          installationMethodsByHost: {
            'host-b': 'wsl',
          },
          wslDistroOverridesByHost: {
            'host-b': 'Ubuntu',
          },
          installationMethod: 'wsl',
          wslDistroOverride: 'Ubuntu',
        },
      },
    });

    expect(settings.installationMethod).toBe('native-windows');
    expect(settings.wslDistroOverride).toBe('');
  });

  it('round-trips installationMethod and trims wslDistroOverride on update for the current host', () => {
    const settingsBag: Record<string, unknown> = {
      providerConfigs: {
        codex: {},
      },
    };

    const next = updateCodexProviderSettings(settingsBag, {
      installationMethod: 'wsl',
      wslDistroOverride: '  Ubuntu-24.04  ',
    });

    expect(next.installationMethod).toBe('wsl');
    expect(next.wslDistroOverride).toBe('Ubuntu-24.04');
    expect(getCodexProviderSettings(settingsBag)).toMatchObject({
      installationMethod: 'wsl',
      wslDistroOverride: 'Ubuntu-24.04',
      installationMethodsByHost: {
        'host-a': 'wsl',
      },
      wslDistroOverridesByHost: {
        'host-a': 'Ubuntu-24.04',
      },
    });
  });

  it('preserves another host installation settings when updating the current host', () => {
    const settingsBag: Record<string, unknown> = {
      providerConfigs: {
        codex: {
          installationMethodsByHost: {
            'host-b': 'wsl',
          },
          wslDistroOverridesByHost: {
            'host-b': 'Debian',
          },
        },
      },
    };

    const next = updateCodexProviderSettings(settingsBag, {
      installationMethod: 'native-windows',
      wslDistroOverride: '  ',
    });

    expect(next.installationMethodsByHost).toEqual({
      'host-b': 'wsl',
      'host-a': 'native-windows',
    });
    expect(next.wslDistroOverridesByHost).toEqual({
      'host-b': 'Debian',
    });
  });

  it('forces reasoning summary off for GPT-5.3 Codex Spark', () => {
    const settingsBag: Record<string, unknown> = {
      providerConfigs: {
        codex: {
          reasoningSummary: 'detailed',
        },
      },
    };

    expect(getEffectiveCodexReasoningSummary(settingsBag, CODEX_SPARK_MODEL)).toBe('none');
    expect(getEffectiveCodexReasoningSummary(settingsBag, 'gpt-5.5')).toBe('detailed');
  });

  it('sets reasoning summary off when applying GPT-5.3 Codex Spark model defaults', () => {
    const settingsBag: Record<string, unknown> = {
      providerConfigs: {
        codex: {
          reasoningSummary: 'detailed',
        },
      },
    };

    applyCodexModelDefaults(CODEX_SPARK_MODEL, settingsBag);

    expect(getCodexProviderSettings(settingsBag).reasoningSummary).toBe('none');
  });
});
