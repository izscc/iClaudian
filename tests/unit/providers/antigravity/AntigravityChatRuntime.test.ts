import '@/providers';

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';

import { AntigravityChatRuntime } from '@/providers/antigravity/runtime/AntigravityChatRuntime';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require('node:child_process') as { spawn: jest.Mock };

const mockReadFile = fs.readFile as unknown as jest.Mock;
const mockWriteFile = fs.writeFile as unknown as jest.Mock;
const mockMkdir = fs.mkdir as unknown as jest.Mock;

function createMockPlugin() {
  return {
    app: {
      vault: {
        adapter: {
          basePath: '/tmp/claudian-antigravity-vault',
        },
      },
    },
    getAllViews: jest.fn().mockReturnValue([]),
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/usr/local/bin/agy'),
    manifest: { version: '0.0.0-test' },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    settings: {
      model: 'antigravity:gemini-3.6-flash-medium',
      providerConfigs: {
        antigravity: {
          enabled: true,
          selectedApprovalMode: 'yolo',
        },
      },
      settingsProvider: 'antigravity',
    },
  } as any;
}

function createFakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: jest.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: jest.fn() });
  child.kill = jest.fn();
  return child;
}

describe('AntigravityChatRuntime model invocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    spawn.mockImplementation(() => {
      const child = createFakeChild();
      setImmediate(() => {
        child.stdout.emit('data', 'agy output');
        child.emit('close', 0, null);
      });
      return child;
    });
  });

  it('does not write into ~/.gemini during ensureReady (blank-tab prewarm path)', async () => {
    const runtime = new AntigravityChatRuntime(createMockPlugin());

    await expect(runtime.ensureReady({ allowSessionCreation: false })).resolves.toBe(true);

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it('passes the selected model directly to the headless print query', async () => {
    const runtime = new AntigravityChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: 'hello' } as any);

    const chunks: Array<Record<string, unknown>> = [];
    for await (const chunk of runtime.query(turn)) {
      chunks.push(chunk as Record<string, unknown>);
    }

    const args = spawn.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining([
      '--dangerously-skip-permissions',
      '--model',
      'gemini-3.6-flash-medium',
      '-p',
      'hello',
    ]));
    expect(args).not.toContain('--print');
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });

  it('falls back to prompt history after native continuation fails', async () => {
    let invocation = 0;
    spawn.mockImplementation(() => {
      const child = createFakeChild();
      invocation += 1;
      setImmediate(() => {
        if (invocation === 2) {
          child.stderr.emit('data', 'continuation failed');
          child.emit('close', 1, null);
          return;
        }
        child.stdout.emit('data', 'agy output');
        child.emit('close', 0, null);
      });
      return child;
    });
    const runtime = new AntigravityChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: 'hello' } as any);
    const history = [{ role: 'user', content: 'previous' }] as any;

    for await (const chunk of runtime.query(turn)) void chunk;
    for await (const chunk of runtime.query(turn, history)) void chunk;
    for await (const chunk of runtime.query(turn, history)) void chunk;

    expect(spawn.mock.calls[1]?.[1]).toContain('--continue');
    expect(spawn.mock.calls[2]?.[1]).not.toContain('--continue');
  });

  it('falls back to prompt history after the print process errors', async () => {
    let invocation = 0;
    spawn.mockImplementation(() => {
      const child = createFakeChild();
      invocation += 1;
      setImmediate(() => {
        if (invocation === 2) {
          child.emit('error', new Error('spawn failed'));
          return;
        }
        child.stdout.emit('data', 'agy output');
        child.emit('close', 0, null);
      });
      return child;
    });
    const runtime = new AntigravityChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: 'hello' } as any);
    const history = [{ role: 'user', content: 'previous' }] as any;

    for await (const chunk of runtime.query(turn)) void chunk;
    for await (const chunk of runtime.query(turn, history)) void chunk;
    for await (const chunk of runtime.query(turn, history)) void chunk;

    expect(spawn.mock.calls[1]?.[1]).toContain('--continue');
    expect(spawn.mock.calls[2]?.[1]).not.toContain('--continue');
  });

  it('falls back to prompt history after cancellation', async () => {
    let invocation = 0;
    spawn.mockImplementation(() => {
      const child = createFakeChild();
      invocation += 1;
      if (invocation === 2) {
        child.kill.mockImplementation(() => {
          setImmediate(() => child.emit('close', null, 'SIGTERM'));
          return true;
        });
      } else {
        setImmediate(() => {
          child.stdout.emit('data', 'agy output');
          child.emit('close', 0, null);
        });
      }
      return child;
    });
    const runtime = new AntigravityChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: 'hello' } as any);
    const history = [{ role: 'user', content: 'previous' }] as any;

    for await (const chunk of runtime.query(turn)) void chunk;
    const continuedQuery = runtime.query(turn, history);
    const pendingChunk = continuedQuery.next();
    await new Promise(resolve => setImmediate(resolve));
    runtime.cancel();
    await pendingChunk;
    for await (const chunk of continuedQuery) void chunk;
    for await (const chunk of runtime.query(turn, history)) void chunk;

    expect(spawn.mock.calls[1]?.[1]).toContain('--continue');
    expect(spawn.mock.calls[2]?.[1]).not.toContain('--continue');
  });
});
