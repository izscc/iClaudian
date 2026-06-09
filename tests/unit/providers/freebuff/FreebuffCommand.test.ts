import { buildFreebuffCliInvocation } from '@/providers/freebuff/runtime/FreebuffCliInvocation';

describe('buildFreebuffCliInvocation', () => {
  it('uses freebuff from PATH and sends prompt over stdin for the Freebuff mode', () => {
    expect(buildFreebuffCliInvocation({
      cwd: '/vault',
      prompt: 'hello',
      selectedModel: 'freebuff:freebuff',
    })).toEqual({
      args: ['--cwd', '/vault'],
      command: 'freebuff',
      stdinText: 'hello\n',
    });
  });

  it('uses codebuff mode flags and passes the prompt as argv for Codebuff modes', () => {
    expect(buildFreebuffCliInvocation({
      cwd: '/vault',
      prompt: 'make a plan',
      selectedModel: 'freebuff:codebuff-plan',
    })).toEqual({
      args: ['--cwd', '/vault', '--plan', 'make a plan'],
      command: 'codebuff',
      stdinText: null,
    });
  });

  it('lets a configured path override the executable while keeping mode flags centralized', () => {
    expect(buildFreebuffCliInvocation({
      configuredCliPath: '/opt/bin/freebuff',
      cwd: '/vault',
      prompt: 'hello',
      selectedModel: 'freebuff:codebuff-lite',
    })).toEqual({
      args: ['--cwd', '/vault', '--lite', 'hello'],
      command: '/opt/bin/freebuff',
      stdinText: null,
    });
  });
});
