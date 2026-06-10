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
      model: 'antigravity:gemini-3-pro',
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

describe('AntigravityChatRuntime model persistence', () => {
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

  it('persists the selected model before launching a print query', async () => {
    const runtime = new AntigravityChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: 'hello' } as any);

    const chunks: Array<Record<string, unknown>> = [];
    for await (const chunk of runtime.query(turn)) {
      chunks.push(chunk as Record<string, unknown>);
    }

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('antigravity-cli'),
      expect.stringContaining('"model"'),
      'utf-8',
    );
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });
});
