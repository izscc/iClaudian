import { EventEmitter } from 'node:events';

import { AntigravityAuxQueryRunner } from '@/providers/antigravity/runtime/AntigravityAuxQueryRunner';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require('node:child_process') as { spawn: jest.Mock };

function createFakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function createMockPlugin() {
  return {
    app: {
      vault: {
        adapter: { basePath: '/tmp/claudian-antigravity-vault' },
      },
    },
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/usr/local/bin/agy'),
    settings: {
      providerConfigs: {
        antigravity: { enabled: true, selectedApprovalMode: 'default' },
      },
    },
  } as any;
}

describe('AntigravityAuxQueryRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    spawn.mockImplementation(() => {
      const child = createFakeChild();
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('result'));
        child.emit('exit', 0, null);
      });
      return child;
    });
  });

  it('leaves the model flag unset for the synthetic Antigravity selection', async () => {
    const runner = new AntigravityAuxQueryRunner(createMockPlugin());

    await expect(runner.query({ model: 'antigravity', systemPrompt: '' }, 'hello')).resolves.toBe('result');

    const args = spawn.mock.calls[0]?.[1] as string[];
    expect(args).not.toContain('--model');
    expect(args).toEqual(expect.arrayContaining(['-p', 'hello']));
  });
});
