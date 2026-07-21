import '@/providers';

import { DEFAULT_CLAUDIAN_SETTINGS } from '@/app/settings/defaultSettings';
import type { CodexDiscoveredModel } from '@/providers/codex/models';
import {
  CodexModelCatalogService,
  type CodexModelDiscoverySource,
} from '@/providers/codex/runtime/CodexModelCatalogService';

function makeModel(model: string): CodexDiscoveredModel {
  return {
    model,
    displayName: model,
    description: `${model} description`,
    supportedReasoningEfforts: [{ value: 'medium', description: 'Balanced' }],
    defaultReasoningEffort: 'medium',
    serviceTiers: [],
    defaultServiceTier: null,
    inputModalities: ['text', 'image'],
    isDefault: true,
  };
}

function createHarness(options: {
  readonly cachedModels?: readonly CodexDiscoveredModel[];
  readonly catalogTimestamp?: number;
  readonly discoveredModels?: readonly CodexDiscoveredModel[];
} = {}) {
  const settings: Record<string, unknown> = {
    ...DEFAULT_CLAUDIAN_SETTINGS,
    providerConfigs: {
      codex: {
        enabled: true,
        discoveredModels: options.cachedModels ?? [],
        catalogTimestamp: options.catalogTimestamp ?? 0,
      },
    },
  };
  const saveSettings = jest.fn(async () => undefined);
  const refreshModelSelectors = jest.fn();
  const discoverModels: jest.MockedFunction<CodexModelDiscoverySource['discoverModels']> = jest.fn(async () => ({
    kind: 'completed' as const,
    models: options.discoveredModels ?? [],
  }));
  const discovery: CodexModelDiscoverySource = { discoverModels };
  const service = new CodexModelCatalogService({
    getSettings: () => settings,
    saveSettings,
    refreshModelSelectors,
  }, discovery);
  return { discoverModels, refreshModelSelectors, saveSettings, service, settings };
}

describe('CodexModelCatalogService', () => {
  it('reuses a fresh cached catalog without launching Codex', async () => {
    const harness = createHarness({
      cachedModels: [makeModel('gpt-cached')],
      catalogTimestamp: Date.now(),
    });

    await expect(harness.service.refresh()).resolves.toEqual({ changed: false });
    expect(harness.discoverModels).not.toHaveBeenCalled();
  });

  it('persists a discovered catalog and refreshes open model selectors', async () => {
    const harness = createHarness({
      discoveredModels: [makeModel('gpt-5.6-sol')],
    });

    await expect(harness.service.refresh()).resolves.toEqual({ changed: true });
    expect(harness.saveSettings).toHaveBeenCalledTimes(1);
    expect(harness.refreshModelSelectors).toHaveBeenCalledTimes(1);
    expect(harness.settings).toMatchObject({
      providerConfigs: {
        codex: {
          discoveredModels: [expect.objectContaining({ model: 'gpt-5.6-sol' })],
        },
      },
    });
  });

  it('preserves a cached catalog when discovery returns diagnostics', async () => {
    const cachedModel = makeModel('gpt-cached');
    const settings: Record<string, unknown> = {
      ...DEFAULT_CLAUDIAN_SETTINGS,
      providerConfigs: {
        codex: {
          enabled: true,
          discoveredModels: [cachedModel],
          catalogTimestamp: 0,
        },
      },
    };
    const discovery: CodexModelDiscoverySource = {
      discoverModels: async () => ({
        kind: 'completed',
        diagnostics: 'app-server unavailable',
        models: [],
      }),
    };
    const service = new CodexModelCatalogService({
      getSettings: () => settings,
      saveSettings: async () => undefined,
      refreshModelSelectors: () => undefined,
    }, discovery);

    await expect(service.refresh()).resolves.toEqual({
      changed: false,
      diagnostics: 'app-server unavailable',
    });
    expect(settings).toMatchObject({
      providerConfigs: {
        codex: {
          discoveredModels: [expect.objectContaining({ model: 'gpt-cached' })],
        },
      },
    });
  });

  it('deduplicates concurrent refreshes', async () => {
    let releaseDiscovery: (models: readonly CodexDiscoveredModel[]) => void = () => undefined;
    const discoveryResult = new Promise<readonly CodexDiscoveredModel[]>((resolve) => {
      releaseDiscovery = resolve;
    });
    const harness = createHarness();
    harness.discoverModels.mockImplementation(async () => ({
      kind: 'completed' as const,
      models: await discoveryResult,
    }));

    const first = harness.service.refresh(true);
    const second = harness.service.refresh(true);
    expect(harness.discoverModels).toHaveBeenCalledTimes(1);

    releaseDiscovery([makeModel('gpt-concurrent')]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { changed: true },
      { changed: true },
    ]);
  });

  it('restores settings when persistence fails', async () => {
    const harness = createHarness({
      cachedModels: [makeModel('gpt-cached')],
      discoveredModels: [makeModel('gpt-poison')],
    });
    harness.saveSettings.mockRejectedValueOnce(new Error('disk full'));

    await expect(harness.service.refresh(true)).resolves.toEqual({
      changed: false,
      diagnostics: 'disk full',
    });
    expect(harness.settings).toMatchObject({
      providerConfigs: {
        codex: {
          discoveredModels: [expect.objectContaining({ model: 'gpt-cached' })],
          catalogTimestamp: 0,
        },
      },
    });
  });

  it('refreshes again when the scheduled catalog TTL expires', async () => {
    jest.useFakeTimers();
    const harness = createHarness({ discoveredModels: [makeModel('gpt-scheduled')] });

    await harness.service.refresh(true);
    expect(harness.discoverModels).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(6 * 60 * 60 * 1_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.discoverModels).toHaveBeenCalledTimes(2);
    await harness.service.dispose();
    jest.useRealTimers();
  });

  it('aborts in-flight discovery when disposed', async () => {
    const harness = createHarness();
    const observed: { signal: AbortSignal | null } = { signal: null };
    harness.discoverModels.mockImplementation((signal?: AbortSignal) => new Promise((resolve) => {
      observed.signal = signal ?? null;
      signal?.addEventListener('abort', () => resolve({
        kind: 'completed' as const,
        diagnostics: 'cancelled',
        models: [],
      }), { once: true });
    }));

    const refresh = harness.service.refresh(true);
    const disposal = harness.service.dispose();

    await expect(refresh).resolves.toEqual({ changed: false });
    await disposal;
    expect(observed.signal?.aborted).toBe(true);
    expect(harness.saveSettings).not.toHaveBeenCalled();
  });
});
