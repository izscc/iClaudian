import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

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
      '--mode', 'autopilot',
      '--autopilot',
      '--allow-all',
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

  it('uses Copilot ACP URL mode ids when applying permission modes', async () => {
    const runtime = new CopilotChatRuntime(createMockPlugin({
      providerConfigs: { copilot: { enabled: true, selectedApprovalMode: 'default' } },
    }));
    const setMode = jest.fn().mockResolvedValue({});
    const syncPermission = jest.fn();
    (runtime as any).connection = { setMode };
    runtime.setPermissionModeSyncCallback(syncPermission);

    await (runtime as any).applySelectedMode('session-1');

    expect(setMode).toHaveBeenCalledWith({
      modeId: 'https://agentclientprotocol.com/protocol/session-modes#agent',
      sessionId: 'session-1',
    });
    expect(syncPermission).toHaveBeenCalledWith('normal');
  });

  it('maps Copilot YOLO to ACP autopilot mode', async () => {
    const runtime = new CopilotChatRuntime(createMockPlugin({
      providerConfigs: { copilot: { enabled: true, selectedApprovalMode: 'yolo' } },
    }));
    const setMode = jest.fn().mockResolvedValue({});
    const syncPermission = jest.fn();
    (runtime as any).connection = { setMode };
    runtime.setPermissionModeSyncCallback(syncPermission);

    await (runtime as any).applySelectedMode('session-1');

    expect(setMode).toHaveBeenCalledWith({
      modeId: 'https://agentclientprotocol.com/protocol/session-modes#autopilot',
      sessionId: 'session-1',
    });
    expect(syncPermission).toHaveBeenCalledWith('yolo');
  });

  it('maps Copilot plan and autopilot mode URLs back to the shared permission toggle', async () => {
    const runtime = new CopilotChatRuntime(createMockPlugin());
    const syncPermission = jest.fn();
    runtime.setPermissionModeSyncCallback(syncPermission);

    (runtime as any).emitPermissionModeSync('https://agentclientprotocol.com/protocol/session-modes#plan');
    (runtime as any).emitPermissionModeSync('https://agentclientprotocol.com/protocol/session-modes#autopilot');

    expect(syncPermission).toHaveBeenNthCalledWith(1, 'plan');
    expect(syncPermission).toHaveBeenNthCalledWith(2, 'yolo');
  });


  it('overwrites absolute and file URL paths through the ACP filesystem delegate', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iclaudian-copilot-'));
    const absolutePath = path.join(tmpDir, 'note with spaces.md');
    const fileUrlPath = path.join(tmpDir, '中文 note.md');
    const runtime = new CopilotChatRuntime(createMockPlugin());

    await (runtime as any).writeTextFile({ sessionId: 'session-1', path: absolutePath, content: 'old' });
    await (runtime as any).writeTextFile({ sessionId: 'session-1', path: absolutePath, content: 'new content' });
    await (runtime as any).writeTextFile({ sessionId: 'session-1', path: pathToFileURL(fileUrlPath).href, content: 'file url content' });

    expect(fs.readFileSync(absolutePath, 'utf-8')).toBe('new content');
    expect(fs.readFileSync(fileUrlPath, 'utf-8')).toBe('file url content');
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
