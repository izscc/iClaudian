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
      '--acp',
      '--model', 'gpt-5.4-mini',
      '--effort', 'xhigh',
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
    const setConfigOption = jest.fn().mockResolvedValue({});
    const syncPermission = jest.fn();
    (runtime as any).connection = { setConfigOption, setMode };
    runtime.setPermissionModeSyncCallback(syncPermission);

    await (runtime as any).applySelectedMode('session-1');

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'allow_all',
      sessionId: 'session-1',
      type: 'select',
      value: 'off',
    });
    expect(setMode).toHaveBeenCalledWith({
      modeId: 'https://agentclientprotocol.com/protocol/session-modes#agent',
      sessionId: 'session-1',
    });
    expect(syncPermission).toHaveBeenCalledWith('normal');
  });

  it('maps Copilot YOLO to ACP allow_all config', async () => {
    const runtime = new CopilotChatRuntime(createMockPlugin({
      providerConfigs: { copilot: { enabled: true, selectedApprovalMode: 'yolo' } },
    }));
    const setMode = jest.fn().mockResolvedValue({});
    const setConfigOption = jest.fn().mockResolvedValue({});
    const syncPermission = jest.fn();
    (runtime as any).connection = { setConfigOption, setMode };
    runtime.setPermissionModeSyncCallback(syncPermission);

    await (runtime as any).applySelectedMode('session-1');

    expect(setConfigOption).toHaveBeenCalledWith({
      configId: 'allow_all',
      sessionId: 'session-1',
      type: 'select',
      value: 'on',
    });
    expect(setMode).not.toHaveBeenCalled();
    expect(syncPermission).toHaveBeenCalledWith('yolo');
  });

  it('maps Copilot plan and autopilot mode URLs back to the shared permission toggle', async () => {
    const runtime = new CopilotChatRuntime(createMockPlugin());
    const syncPermission = jest.fn();
    runtime.setPermissionModeSyncCallback(syncPermission);

    (runtime as any).emitPermissionModeSync('https://agentclientprotocol.com/protocol/session-modes#plan');
    (runtime as any).emitPermissionModeSync('https://agentclientprotocol.com/protocol/session-modes#autopilot');
    (runtime as any).emitPermissionModeSync('allow-all');

    expect(syncPermission).toHaveBeenNthCalledWith(1, 'plan');
    expect(syncPermission).toHaveBeenNthCalledWith(2, 'yolo');
    expect(syncPermission).toHaveBeenNthCalledWith(3, 'yolo');
  });


  it('uses Copilot prompt fallback with inline Obsidian note context and external directories', () => {
    fs.mkdirSync('/tmp/claudian-test-vault/Notes', { recursive: true });
    fs.writeFileSync('/tmp/claudian-test-vault/Notes/The more you generate.md', 'CURRENT_NOTE_TOKEN_42', 'utf-8');
    const runtime = new CopilotChatRuntime(createMockPlugin({
      effortLevel: 'max',
      providerConfigs: { copilot: { enabled: true, selectedApprovalMode: 'default' } },
    }));

    const turn = runtime.prepareTurn({
      text: '翻译',
      currentNotePath: 'Notes/The more you generate.md',
      externalContextPaths: ['/tmp/reference'],
    });
    const prompt = (runtime as any).buildPromptModePrompt(turn, []);
    const attachments = (runtime as any).resolvePromptModeAttachmentPaths(turn, []);
    const args = (runtime as any).buildPromptModeArgs({
      attachments,
      externalContextPaths: ['/tmp/reference'],
      model: 'gpt-5.4-mini',
      prompt,
    });

    expect(prompt).toContain('[Obsidian current note]');
    expect(prompt).toContain('/tmp/claudian-test-vault/Notes/The more you generate.md');
    expect(prompt).toContain('CURRENT_NOTE_TOKEN_42');
    expect(attachments).toEqual([]);
    expect(args).not.toContain('--attachment');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/tmp/reference');
  });

  it('keeps the selected note embedded in Copilot prompt fallback after the first turn', () => {
    fs.mkdirSync('/tmp/claudian-test-vault/Notes', { recursive: true });
    fs.writeFileSync('/tmp/claudian-test-vault/Notes/The more you generate.md', 'PREVIOUS_NOTE_TOKEN_99', 'utf-8');
    const runtime = new CopilotChatRuntime(createMockPlugin({
      providerConfigs: { copilot: { enabled: true, selectedApprovalMode: 'default' } },
    }));
    const turn = runtime.prepareTurn({ text: '继续翻译' });
    const previousMessages = [{
      id: 'u1',
      role: 'user',
      content: '翻译',
      currentNote: 'Notes/The more you generate.md',
      timestamp: 1,
    }];

    const prompt = (runtime as any).buildPromptModePrompt(turn, previousMessages);

    expect(prompt).toContain('/tmp/claudian-test-vault/Notes/The more you generate.md');
    expect(prompt).toContain('PREVIOUS_NOTE_TOKEN_99');
    expect((runtime as any).resolvePromptModeAttachmentPaths(turn, previousMessages)).toEqual([]);
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
