import { CodexModelDiscoveryService } from '@/providers/codex/runtime/CodexModelDiscoveryService';

const mockTransportRequest = jest.fn();
const mockTransportDispose = jest.fn();
const mockTransportStart = jest.fn();
const mockProcessStart = jest.fn();
const mockProcessShutdown = jest.fn().mockResolvedValue(undefined);
const mockProcessStderr = jest.fn().mockReturnValue('');
const mockInitializeTransport = jest.fn();

jest.mock('@/providers/codex/runtime/CodexRpcTransport', () => ({
  CodexRpcTransport: jest.fn().mockImplementation(() => ({
    request: mockTransportRequest,
    dispose: mockTransportDispose,
    start: mockTransportStart,
    notify: jest.fn(),
  })),
}));

jest.mock('@/providers/codex/runtime/CodexAppServerProcess', () => ({
  CodexAppServerProcess: jest.fn().mockImplementation(() => ({
    start: mockProcessStart,
    shutdown: mockProcessShutdown,
    getStderrSnapshot: mockProcessStderr,
  })),
}));

jest.mock('@/providers/codex/runtime/codexAppServerSupport', () => ({
  initializeCodexAppServerTransport: (...args: unknown[]) => mockInitializeTransport(...args),
}));

function makeWireModel(model: string, isDefault = false): Record<string, unknown> {
  return {
    id: model,
    model,
    displayName: model,
    description: `${model} description`,
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Balanced' },
    ],
    defaultReasoningEffort: 'medium',
    inputModalities: ['text', 'image'],
    isDefault,
  };
}

function createService(enabled = true): CodexModelDiscoveryService {
  return new CodexModelDiscoveryService({
    isEnabled: () => enabled,
    resolveLaunchSpec: () => ({
      target: { method: 'host-native', platformFamily: 'unix', platformOs: 'linux' },
      command: 'codex',
      args: ['app-server', '--listen', 'stdio://'],
      spawnCwd: '/workspace',
      targetCwd: '/workspace',
      env: {},
      pathMapper: {
        target: { method: 'host-native', platformFamily: 'unix', platformOs: 'linux' },
        toTargetPath: value => value,
        toHostPath: value => value,
        mapTargetPathList: values => values,
        canRepresentHostPath: () => true,
      },
    }),
  });
}

describe('CodexModelDiscoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeTransport.mockResolvedValue({ codexHome: '/home/user/.codex' });
  });

  it('does not launch Codex when the provider is disabled', async () => {
    await expect(createService(false).discoverModels())
      .resolves.toEqual({ kind: 'skipped', reason: 'provider-disabled' });
    expect(mockProcessStart).not.toHaveBeenCalled();
  });

  it('loads every model/list page through a short-lived app-server', async () => {
    mockTransportRequest
      .mockResolvedValueOnce({ data: [makeWireModel('gpt-5.6-sol', true)], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ data: [makeWireModel('gpt-5.6-luna')], nextCursor: null });

    const result = await createService().discoverModels();

    expect(result).toEqual(expect.objectContaining({
      kind: 'completed',
      models: [
        expect.objectContaining({ model: 'gpt-5.6-sol' }),
        expect.objectContaining({ model: 'gpt-5.6-luna' }),
      ],
    }));
    expect(mockTransportRequest).toHaveBeenNthCalledWith(1, 'model/list', {
      includeHidden: false,
      limit: 100,
    });
    expect(mockTransportRequest).toHaveBeenNthCalledWith(2, 'model/list', {
      cursor: 'page-2',
      includeHidden: false,
      limit: 100,
    });
    expect(mockTransportDispose).toHaveBeenCalledTimes(1);
    expect(mockProcessShutdown).toHaveBeenCalledTimes(1);
  });

  it('returns app-server stderr and still shuts down after discovery failure', async () => {
    mockTransportRequest.mockRejectedValueOnce(new Error('Method not found'));
    mockProcessStderr.mockReturnValueOnce('codex app-server stderr');

    await expect(createService().discoverModels()).resolves.toEqual({
      diagnostics: 'Method not found\n\ncodex app-server stderr',
      kind: 'completed',
      models: [],
    });
    expect(mockTransportDispose).toHaveBeenCalledTimes(1);
    expect(mockProcessShutdown).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate stderr already included in the transport error', async () => {
    mockTransportRequest.mockRejectedValueOnce(
      new Error('App-server process exited:\ncodex app-server stderr'),
    );
    mockProcessStderr.mockReturnValueOnce('codex app-server stderr');

    await expect(createService().discoverModels()).resolves.toEqual({
      diagnostics: 'App-server process exited:\ncodex app-server stderr',
      kind: 'completed',
      models: [],
    });
  });

  it('rejects unbounded pagination with unique cursors', async () => {
    for (let page = 1; page <= 21; page++) {
      mockTransportRequest.mockResolvedValueOnce({
        data: [],
        nextCursor: `page-${page}`,
      });
    }

    const result = await createService().discoverModels();

    expect(result).toEqual(expect.objectContaining({
      kind: 'completed',
      diagnostics: expect.stringContaining('exceeded 20 pages'),
      models: [],
    }));
    expect(mockTransportRequest).toHaveBeenCalledTimes(20);
  });

  it('rejects a page that ignores the requested model limit', async () => {
    mockTransportRequest.mockResolvedValueOnce({
      data: Array.from({ length: 101 }, (_, index) => makeWireModel(`gpt-${index}`)),
      nextCursor: null,
    });

    const result = await createService().discoverModels();

    expect(result).toEqual(expect.objectContaining({
      kind: 'completed',
      diagnostics: expect.stringContaining('Too big'),
      models: [],
    }));
  });

  it('keeps a successful result when process cleanup fails', async () => {
    mockTransportRequest.mockResolvedValueOnce({
      data: [makeWireModel('gpt-cleanup')],
      nextCursor: null,
    });
    mockProcessShutdown.mockRejectedValueOnce(new Error('already exited'));

    await expect(createService().discoverModels()).resolves.toEqual(expect.objectContaining({
      kind: 'completed',
      models: [expect.objectContaining({ model: 'gpt-cleanup' })],
    }));
  });
});
