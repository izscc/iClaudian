import { EventEmitter } from 'node:events';

const spawnMock = jest.fn();
const mockReadAssistantResponse = jest.fn();

jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

jest.mock('@/utils/path', () => ({
  ...jest.requireActual('@/utils/path'),
  getVaultPath: jest.fn().mockReturnValue('/test/vault'),
}));

jest.mock('@/providers/freebuff/runtime/FreebuffModelSettings', () => ({
  persistFreebuffModelSelection: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/providers/freebuff/runtime/FreebuffChatStateWatcher', () => ({
  FreebuffChatStateWatcher: jest.fn().mockImplementation(() => ({
    hasPromptStarted: jest.fn().mockReturnValue(false),
    readAssistantResponse: mockReadAssistantResponse,
  })),
}));

import { FreebuffAuxQueryRunner } from '@/providers/freebuff/runtime/FreebuffAuxQueryRunner';

function createMockChild(): any {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter() as any;
  child.stderr = new EventEmitter() as any;
  child.stdin = { write: jest.fn(), destroyed: false };
  child.kill = jest.fn();
  return child;
}

function createRunner(): FreebuffAuxQueryRunner {
  return new FreebuffAuxQueryRunner({
    app: {},
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/bin/freebuff'),
    settings: {
      providerConfigs: { freebuff: { enabled: true } },
    },
  } as any);
}

describe('FreebuffAuxQueryRunner', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    mockReadAssistantResponse.mockReset();
    mockReadAssistantResponse.mockReturnValue(null);
  });

  it('resolves from saved Freebuff chat state without waiting for process exit', async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);
    mockReadAssistantResponse.mockReturnValueOnce(null).mockReturnValue('aux answer');

    const resultPromise = createRunner().query({ model: 'freebuff:minimax-m2.7', systemPrompt: '' }, 'hello');
    await new Promise(resolve => setImmediate(resolve));

    child.stdout.emit('data', '\x1b[1;1HEnter a coding task or / for commands');
    child.stdout.emit('data', '\x1b[2;1Hworking...');

    await expect(resultPromise).resolves.toBe('aux answer');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
