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

function emitSuccessfulStream(child: ReturnType<typeof createFakeChild>, response = 'agy output') {
  child.stdout.emit('data', `${JSON.stringify({
    event: 'step_update',
    step_update: { text_delta: response },
  })}\n${JSON.stringify({
    event: 'result',
    result: { response, status: 'SUCCESS' },
  })}\n`);
  child.emit('close', 0, null);
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
        emitSuccessfulStream(child);
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

  it('streams tool progress and task updates instead of returning raw NDJSON', async () => {
    spawn.mockImplementation(() => {
      const child = createFakeChild();
      setImmediate(() => {
        const events = [
          {
            event: 'step_update',
            step_update: {
              state: 'RUNNING',
              step_index: 1,
              tool_info: { parameters: { command: 'find . -maxdepth 1' }, tool_name: 'run_command' },
            },
          },
          {
            event: 'step_update',
            step_update: {
              state: 'DONE',
              step_index: 1,
              tool_info: { output: 'README.md', parameters: { command: 'find . -maxdepth 1' }, tool_name: 'run_command' },
            },
          },
          {
            event: 'step_update',
            step_update: { task_boundary: { task_name: 'Inspect repository', task_status: 'IN_PROGRESS' } },
          },
          {
            event: 'step_update',
            step_update: { text_delta: 'The repository is ready.' },
          },
          {
            event: 'result',
            result: { response: 'The repository is ready.', status: 'SUCCESS' },
          },
        ];
        const output = `${events.map(event => JSON.stringify(event)).join('\n')}\n`;
        child.stdout.emit('data', output.slice(0, 17));
        child.stdout.emit('data', output.slice(17));
        child.emit('close', 0, null);
      });
      return child;
    });
    const runtime = new AntigravityChatRuntime(createMockPlugin());
    const turn = runtime.prepareTurn({ text: 'inspect' } as any);
    const chunks = [];

    for await (const chunk of runtime.query(turn)) chunks.push(chunk);

    expect(chunks).toEqual(expect.arrayContaining([
      { id: 'agy-step-1', input: { command: 'find . -maxdepth 1' }, name: 'Bash', type: 'tool_use' },
      { content: 'README.md', id: 'agy-step-1', isError: false, type: 'tool_result' },
      { id: 'agy-task-1', input: { activeForm: 'Inspect repository', subject: 'Inspect repository' }, name: 'TaskCreate', type: 'tool_use' },
      expect.objectContaining({ name: 'TaskUpdate', type: 'tool_use' }),
      { content: 'The repository is ready.', type: 'text' },
    ]));
    expect(chunks.some(chunk => chunk.type === 'text' && chunk.content.includes('"event"'))).toBe(false);
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
        emitSuccessfulStream(child);
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
        emitSuccessfulStream(child);
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
          emitSuccessfulStream(child);
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
