import '@/providers';

import { AcpClientConnection, AcpJsonRpcTransport, AcpSubprocess } from '@/providers/acp';
import { GeminiChatRuntime } from '@/providers/gemini/runtime/GeminiChatRuntime';

jest.mock('@/providers/acp', () => {
  const actual = jest.requireActual('@/providers/acp');
  return {
    ...actual,
    AcpClientConnection: jest.fn(),
    AcpJsonRpcTransport: jest.fn(),
    AcpSubprocess: jest.fn(),
  };
});

const MockAcpClientConnection = AcpClientConnection as jest.MockedClass<typeof AcpClientConnection>;
const MockAcpJsonRpcTransport = AcpJsonRpcTransport as jest.MockedClass<typeof AcpJsonRpcTransport>;
const MockAcpSubprocess = AcpSubprocess as jest.MockedClass<typeof AcpSubprocess>;

function createMockPlugin(settings: Record<string, unknown> = {}) {
  return {
    app: {
      vault: {
        adapter: {
          basePath: '/tmp/claudian-gemini-vault',
        },
      },
    },
    getAllViews: jest.fn().mockReturnValue([]),
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/usr/local/bin/gemini'),
    manifest: { version: '0.0.0-test' },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    settings: {
      model: 'gemini:gemini-3.1-pro-preview',
      providerConfigs: {
        gemini: {
          enabled: true,
          selectedApprovalMode: 'yolo',
        },
      },
      settingsProvider: 'gemini',
      ...settings,
    },
  } as any;
}

describe('GeminiChatRuntime', () => {
  let mockConnection: {
    dispose: jest.Mock;
    initialize: jest.Mock;
  };
  let mockProcess: {
    getStderrSnapshot: jest.Mock;
    isAlive: jest.Mock;
    onClose: jest.Mock;
    shutdown: jest.Mock;
    start: jest.Mock;
    stdin: Record<string, never>;
    stdout: Record<string, never>;
  };
  let mockTransport: {
    dispose: jest.Mock;
    start: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      dispose: jest.fn(),
      initialize: jest.fn().mockResolvedValue({}),
    };
    mockProcess = {
      getStderrSnapshot: jest.fn().mockReturnValue(''),
      isAlive: jest.fn().mockReturnValue(true),
      onClose: jest.fn(),
      shutdown: jest.fn().mockResolvedValue(undefined),
      start: jest.fn(),
      stdin: {},
      stdout: {},
    };
    mockTransport = {
      dispose: jest.fn(),
      start: jest.fn(),
    };

    MockAcpClientConnection.mockImplementation(() => mockConnection as any);
    MockAcpJsonRpcTransport.mockImplementation(() => mockTransport as any);
    MockAcpSubprocess.mockImplementation(() => mockProcess as any);
  });

  it('uses an extended timeout for the Gemini ACP initialize handshake', async () => {
    const runtime = new GeminiChatRuntime(createMockPlugin());

    await expect(runtime.ensureReady({ allowSessionCreation: false })).resolves.toBe(true);

    expect(mockConnection.initialize).toHaveBeenCalledWith({}, { timeoutMs: 120_000 });
  });

  it('cleans up a partially started Gemini ACP process when initialize fails', async () => {
    mockConnection.initialize.mockRejectedValue(new Error('Request timeout: initialize (30000ms)'));
    const runtime = new GeminiChatRuntime(createMockPlugin());

    await expect(runtime.ensureReady({ allowSessionCreation: false })).rejects.toThrow('Request timeout: initialize (30000ms)');

    expect(mockConnection.dispose).toHaveBeenCalled();
    expect(mockTransport.dispose).toHaveBeenCalled();
    expect(mockProcess.shutdown).toHaveBeenCalled();
    expect(runtime.isReady()).toBe(false);
  });
});
