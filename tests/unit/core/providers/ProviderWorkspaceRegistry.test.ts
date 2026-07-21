import '@/providers';

import {
  initializeProviderWorkspaces,
  ProviderWorkspaceRegistry,
} from '@/core/providers/ProviderWorkspaceRegistry';

describe('initializeProviderWorkspaces', () => {
  it('starts independent provider initializers concurrently', async () => {
    const started: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const initialization = initializeProviderWorkspaces([
      {
        providerId: 'claude',
        initialize: async () => {
          started.push('claude');
          await firstGate;
          return { commandCatalog: null };
        },
      },
      {
        providerId: 'codex',
        initialize: async () => {
          started.push('codex');
          return { commandCatalog: null };
        },
      },
    ]);

    await Promise.resolve();
    expect(started).toEqual(['claude', 'codex']);
    releaseFirst();
    await expect(initialization).resolves.toHaveLength(2);
  });

  it('rejects atomically when any initializer fails', async () => {
    const dispose = jest.fn();
    await expect(initializeProviderWorkspaces([
      {
        providerId: 'claude',
        initialize: async () => ({ commandCatalog: null, dispose }),
      },
      {
        providerId: 'codex',
        initialize: async () => {
          throw new Error('codex init failed');
        },
      },
    ])).rejects.toThrow('codex init failed');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('ProviderWorkspaceRegistry', () => {
  afterEach(() => {
    ProviderWorkspaceRegistry.clear();
  });

  it('returns agent mention providers through the workspace registry', () => {
    const claudeProvider = { searchAgents: jest.fn().mockReturnValue([]) };
    const codexProvider = { searchAgents: jest.fn().mockReturnValue([]) };

    ProviderWorkspaceRegistry.setServices('claude', {
      agentMentionProvider: claudeProvider as any,
    });
    ProviderWorkspaceRegistry.setServices('codex', {
      agentMentionProvider: codexProvider as any,
    });

    expect(ProviderWorkspaceRegistry.getAgentMentionProvider('claude')).toBe(claudeProvider);
    expect(ProviderWorkspaceRegistry.getAgentMentionProvider('codex')).toBe(codexProvider);
  });

  it('refreshes agent mention state through the workspace registry', async () => {
    const refreshClaude = jest.fn().mockResolvedValue(undefined);
    const refreshCodex = jest.fn().mockResolvedValue(undefined);

    ProviderWorkspaceRegistry.setServices('claude', {
      refreshAgentMentions: refreshClaude,
    });
    ProviderWorkspaceRegistry.setServices('codex', {
      refreshAgentMentions: refreshCodex,
    });

    await ProviderWorkspaceRegistry.refreshAgentMentions('codex');

    expect(refreshClaude).not.toHaveBeenCalled();
    expect(refreshCodex).toHaveBeenCalled();
  });

  it('disposes every initialized provider before clearing the registry', async () => {
    const disposeClaude = jest.fn();
    const disposeCodex = jest.fn().mockResolvedValue(undefined);
    ProviderWorkspaceRegistry.setServices('claude', { dispose: disposeClaude });
    ProviderWorkspaceRegistry.setServices('codex', { dispose: disposeCodex });

    await ProviderWorkspaceRegistry.disposeAll();

    expect(disposeClaude).toHaveBeenCalledTimes(1);
    expect(disposeCodex).toHaveBeenCalledTimes(1);
    expect(ProviderWorkspaceRegistry.getServices('claude')).toBeNull();
    expect(ProviderWorkspaceRegistry.getServices('codex')).toBeNull();
  });

  it('continues disposing providers when one disposer throws synchronously', async () => {
    const disposeClaude = jest.fn(() => {
      throw new Error('dispose failed');
    });
    const disposeCodex = jest.fn();
    ProviderWorkspaceRegistry.setServices('claude', { dispose: disposeClaude });
    ProviderWorkspaceRegistry.setServices('codex', { dispose: disposeCodex });

    await expect(ProviderWorkspaceRegistry.disposeAll()).resolves.toBeUndefined();

    expect(disposeClaude).toHaveBeenCalledTimes(1);
    expect(disposeCodex).toHaveBeenCalledTimes(1);
  });

  it('returns the assigned catalog for a provider', () => {
    const mockCatalog = {
      listDropdownEntries: jest.fn(),
      listVaultEntries: jest.fn(),
      saveVaultEntry: jest.fn(),
      deleteVaultEntry: jest.fn(),
      setRuntimeCommands: jest.fn(),
      getDropdownConfig: jest.fn(),
      refresh: jest.fn(),
    };

    ProviderWorkspaceRegistry.setServices('claude', {
      commandCatalog: mockCatalog as any,
    });

    expect(ProviderWorkspaceRegistry.getCommandCatalog('claude')).toBe(mockCatalog);
  });

  it('returns the runtime command loader for a provider', () => {
    const runtimeCommandLoader = {
      isAvailable: jest.fn().mockReturnValue(true),
      loadCommands: jest.fn().mockResolvedValue([]),
    };

    ProviderWorkspaceRegistry.setServices('opencode', {
      runtimeCommandLoader: runtimeCommandLoader as any,
    });

    expect(ProviderWorkspaceRegistry.getRuntimeCommandLoader('opencode')).toBe(runtimeCommandLoader);
  });

  it('returns the tab warmup policy for a provider', () => {
    const tabWarmupPolicy = {
      resolveMode: jest.fn().mockReturnValue('commands'),
    };

    ProviderWorkspaceRegistry.setServices('opencode', {
      tabWarmupPolicy: tabWarmupPolicy as any,
    });

    expect(ProviderWorkspaceRegistry.getTabWarmupPolicy('opencode')).toBe(tabWarmupPolicy);
  });
});
