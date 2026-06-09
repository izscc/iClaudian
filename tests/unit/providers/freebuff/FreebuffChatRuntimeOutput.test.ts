import { EventEmitter } from 'node:events';

import type { StreamChunk } from '@/core/types';

const spawnMock = jest.fn();

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

import { FreebuffChatRuntime } from '@/providers/freebuff/runtime/FreebuffChatRuntime';

function createMockChild(stdoutText?: string): any {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter() as any;
  child.stderr = new EventEmitter() as any;
  child.stdout.setEncoding = jest.fn();
  child.stderr.setEncoding = jest.fn();
  child.stdin = { write: jest.fn(), end: jest.fn() };
  child.kill = jest.fn();
  if (stdoutText !== undefined) {
    setImmediate(() => {
      child.stdout.emit('data', stdoutText);
      child.emit('close', 0, null);
    });
  }
  return child;
}

async function collectChunks(runtime: FreebuffChatRuntime): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of runtime.query({
    isCompact: false,
    mcpMentions: new Set(),
    persistedContent: '',
    prompt: 'hello',
    request: { text: 'hello' },
  }, [], { model: 'freebuff:minimax-m2.7' })) {
    chunks.push(chunk);
  }
  return chunks;
}

function createRuntime(): FreebuffChatRuntime {
  return new FreebuffChatRuntime({
    app: {},
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/bin/freebuff'),
    settings: {
      model: 'freebuff:minimax-m2.7',
      providerConfigs: { freebuff: { enabled: true } },
    },
  } as any);
}

describe('FreebuffChatRuntime output cleanup', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('does not stream raw terminal control sequences from the Freebuff TUI', async () => {
    const terminalFrame = '\x1b[?1049h\x1b[1;1HHello from Freebuff\x1b[2;1HDone\x1b[?1049l\x1b[?25h';
    spawnMock.mockReturnValue(createMockChild(terminalFrame));

    const chunks = await collectChunks(createRuntime());
    const renderedText = chunks
      .filter((chunk): chunk is Extract<StreamChunk, { type: 'text' }> => chunk.type === 'text')
      .map(chunk => chunk.content)
      .join('');

    expect(renderedText).toBe('Hello from Freebuff\nDone');
    expect(renderedText).not.toContain('\x1b');
  });

  it('confirms the Freebuff model picker before sending the prompt', async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const chunksPromise = collectChunks(createRuntime());
    await new Promise(resolve => setImmediate(resolve));

    expect(child.stdin.write).not.toHaveBeenCalled();

    child.stdout.emit('data', '\x1b[?1049hPick a model to start DeepSeek V4 Flash');
    expect(child.stdin.write).toHaveBeenCalledWith('\r');
    expect(child.stdin.write).not.toHaveBeenCalledWith('hello');

    child.stdout.emit('data', 'Enter a coding task or / for commands');
    expect(child.stdin.write).toHaveBeenCalledWith('hello');
    expect(child.stdin.write).toHaveBeenLastCalledWith('\r');

    child.emit('close', 0, null);
    await chunksPromise;
  });
});
