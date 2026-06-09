import { buildFreebuffCliInvocation } from '@/providers/freebuff/runtime/FreebuffCliInvocation';

describe('buildFreebuffCliInvocation', () => {
  it('uses only freebuff from PATH and sends prompt over stdin', () => {
    expect(buildFreebuffCliInvocation({
      cwd: '/vault',
      prompt: 'hello',
      selectedModel: 'freebuff:deepseek-v4-pro',
    })).toEqual({
      args: ['--cwd', '/vault'],
      command: 'freebuff',
      stdinText: 'hello\n',
    });
  });

  it('uses the configured freebuff path', () => {
    expect(buildFreebuffCliInvocation({
      configuredCliPath: '/opt/bin/freebuff',
      cwd: '/vault',
      prompt: 'hello',
      selectedModel: 'freebuff:minimax-m2.7',
    })).toEqual({
      args: ['--cwd', '/vault'],
      command: '/opt/bin/freebuff',
      stdinText: 'hello\n',
    });
  });
});
