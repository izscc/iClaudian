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
    cancel: jest.Mock;
    dispose: jest.Mock;
    initialize: jest.Mock;
    loadSession: jest.Mock;
    newSession: jest.Mock;
    prompt: jest.Mock;
    setConfigOption: jest.Mock;
    setMode: jest.Mock;
    setModel: jest.Mock;
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
      cancel: jest.fn(),
      dispose: jest.fn(),
      initialize: jest.fn().mockResolvedValue({}),
      loadSession: jest.fn().mockResolvedValue({ sessionId: 'sess-1' }),
      newSession: jest.fn().mockResolvedValue({ sessionId: 'sess-1' }),
      prompt: jest.fn().mockResolvedValue({ stopReason: 'end_turn' }),
      setConfigOption: jest.fn().mockResolvedValue({}),
      setMode: jest.fn().mockResolvedValue({}),
      setModel: jest.fn().mockResolvedValue({}),
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

  async function collectQueryChunks(
    runtime: GeminiChatRuntime,
    conversationHistory?: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    const turn = runtime.prepareTurn({ text: 'hello' } as any);
    const chunks: Array<Record<string, unknown>> = [];
    for await (const chunk of runtime.query(turn, conversationHistory as any)) {
      chunks.push(chunk as Record<string, unknown>);
    }
    return chunks;
  }

  it('keeps prompt completions silent unless Gemini streams content or errors', async () => {
    mockConnection.prompt.mockResolvedValue({ stopReason: 'end_turn' });
    const runtime = new GeminiChatRuntime(createMockPlugin());

    const chunks = await collectQueryChunks(runtime);

    expect(chunks.some(chunk => chunk.type === 'notice')).toBe(false);
    expect(chunks.some(chunk => chunk.type === 'error')).toBe(false);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });

  it('applies mid-session model selection via session/set_model', async () => {
    const runtime = new GeminiChatRuntime(createMockPlugin());

    await collectQueryChunks(runtime);

    expect(mockConnection.setModel).toHaveBeenCalledWith({
      modelId: 'gemini-3.1-pro-preview',
      sessionId: 'sess-1',
    });
    expect(mockConnection.setConfigOption).not.toHaveBeenCalledWith(
      expect.objectContaining({ configId: 'model' }),
    );
  });

  it('falls back to the v2.1.0 config-option model switch when session/set_model is unavailable', async () => {
    mockConnection.setModel.mockRejectedValue(new Error('Method not found'));
    const runtime = new GeminiChatRuntime(createMockPlugin());

    await collectQueryChunks(runtime);

    expect(mockConnection.setConfigOption).toHaveBeenCalledWith({
      configId: 'model',
      sessionId: 'sess-1',
      type: 'select',
      value: 'gemini-3.1-pro-preview',
    });
  });

  it('uses the v2.1.0 session/new request shape', async () => {
    const runtime = new GeminiChatRuntime(createMockPlugin());

    await collectQueryChunks(runtime);

    expect(mockConnection.newSession).toHaveBeenCalledWith({ cwd: '/tmp/claudian-gemini-vault', mcpServers: [] });
  });

  it('bootstraps history without adding a synthetic notice when a stale session cannot be resumed', async () => {
    mockConnection.loadSession = jest.fn().mockRejectedValue(new Error('session not found'));
    const runtime = new GeminiChatRuntime(createMockPlugin());
    runtime.syncConversationState({ sessionId: 'stale-sess' });

    const chunks = await collectQueryChunks(runtime, [
      { id: 'u1', role: 'user', content: 'earlier request', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'earlier reply', timestamp: 2 },
    ]);

    expect(mockConnection.loadSession).toHaveBeenCalledWith({ cwd: '/tmp/claudian-gemini-vault', mcpServers: [], sessionId: 'stale-sess' });
    expect(chunks.some(chunk => chunk.type === 'notice')).toBe(false);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });

  it('keeps the v2.1.0 plain prompt shape without current-note resource links', async () => {
    const runtime = new GeminiChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: '翻译', currentNotePath: 'notes/current.md' } as any);

    const chunks: unknown[] = [];
    for await (const chunk of runtime.query(turn)) chunks.push(chunk);

    const promptArg = mockConnection.prompt.mock.calls[0][0];
    expect(promptArg.prompt).not.toContainEqual(expect.objectContaining({ type: 'resource_link' }));
  });
});
