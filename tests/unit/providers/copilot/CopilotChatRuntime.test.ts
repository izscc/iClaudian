import { CopilotChatRuntime } from '@/providers/copilot/runtime/CopilotChatRuntime';

function createMockPlugin(settings: Record<string, unknown> = {}): any {
  return {
    settings,
    manifest: { version: '0.0.0-test' },
    getAllViews: jest.fn().mockReturnValue([]),
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/usr/local/bin/copilot'),
    saveSettings: jest.fn().mockResolvedValue(undefined),
    app: { vault: { adapter: { basePath: '/tmp/claudian-test-vault' } } },
  };
}

describe('CopilotChatRuntime', () => {
  it('builds ACP launch arguments from model, effort, permission, and advanced settings', () => {
    const runtime = new CopilotChatRuntime(createMockPlugin({
      effortLevel: 'xhigh',
      model: 'copilot:gpt-5.4-mini',
      providerConfigs: {
        copilot: {
          additionalMcpConfig: '@/tmp/mcp.json',
          allowTools: 'write\nshell(git:*)',
          autopilot: true,
          customAgent: 'reviewer',
          enableReasoningSummaries: true,
          enabled: true,
          experimental: true,
          githubMcpTools: '*',
          remote: true,
          selectedApprovalMode: 'yolo',
        },
      },
    }));

    expect((runtime as any).buildLaunchArgs()).toEqual([
      '--acp', '--stdio',
      '--model', 'gpt-5.4-mini',
      '--effort', 'xhigh',
      '--allow-all',
      '--autopilot',
      '--experimental',
      '--remote',
      '--enable-reasoning-summaries',
      '--agent', 'reviewer',
      '--additional-mcp-config', '@/tmp/mcp.json',
      '--add-github-mcp-tool', '*',
      '--allow-tool', 'write',
      '--allow-tool', 'shell(git:*)',
    ]);
  });

  it('sends ACP cancel and closes the active queue', async () => {
    const runtime = new CopilotChatRuntime(createMockPlugin());
    const cancel = jest.fn();
    const close = jest.fn();
    (runtime as any).connection = { cancel };
    (runtime as any).sessionId = 'session-1';
    (runtime as any).activeTurn = { sessionId: 'session-1', queue: { close } };

    runtime.cancel();

    expect(cancel).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(close).toHaveBeenCalled();
  });
});
