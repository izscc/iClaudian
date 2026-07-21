import { buildAntigravityPrintArgs } from '@/providers/antigravity/runtime/AntigravityCliInvocation';

describe('buildAntigravityPrintArgs', () => {
  it('uses no permission override in default mode', () => {
    expect(buildAntigravityPrintArgs({
      approvalMode: 'default',
      continueConversation: false,
      model: null,
      prompt: 'hello',
    })).toEqual(['-p', 'hello', '--print-timeout', '5m']);
  });

  it('uses only the explicit skip-permissions flag in yolo mode', () => {
    expect(buildAntigravityPrintArgs({
      approvalMode: 'yolo',
      continueConversation: false,
      model: null,
      prompt: 'hello',
    })).toEqual(['--dangerously-skip-permissions', '-p', 'hello', '--print-timeout', '5m']);
  });

  it('uses accept-edits mode for auto-edit headless requests', () => {
    const args = buildAntigravityPrintArgs({
      approvalMode: 'auto_edit',
      continueConversation: false,
      model: 'gemini-3.6-flash-medium',
      prompt: 'hello',
    });

    expect(args).toEqual([
      '--mode',
      'accept-edits',
      '--model',
      'gemini-3.6-flash-medium',
      '-p',
      'hello',
      '--print-timeout',
      '5m',
    ]);
  });

  it('uses plan mode while continuing a headless conversation', () => {
    const args = buildAntigravityPrintArgs({
      approvalMode: 'plan',
      continueConversation: true,
      model: null,
      prompt: 'continue',
    });

    expect(args).toEqual([
      '--mode',
      'plan',
      '--continue',
      '-p',
      'continue',
      '--print-timeout',
      '5m',
    ]);
  });
});
