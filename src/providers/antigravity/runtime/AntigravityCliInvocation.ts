import type { AntigravityApprovalMode } from '../settings';

interface AntigravityPrintArgsOptions {
  readonly approvalMode: AntigravityApprovalMode;
  readonly continueConversation: boolean;
  readonly model: string | null;
  readonly prompt: string;
}

export function buildAntigravityPrintArgs(options: AntigravityPrintArgsOptions): string[] {
  const permissionArgs = getPermissionArgs(options.approvalMode);

  return [
    ...permissionArgs,
    ...(options.continueConversation ? ['--continue'] : []),
    ...(options.model ? ['--model', options.model] : []),
    '-p',
    options.prompt,
    '--print-timeout',
    '5m',
  ];
}

function getPermissionArgs(mode: AntigravityApprovalMode): string[] {
  switch (mode) {
    case 'auto_edit': return ['--mode', 'accept-edits'];
    case 'plan': return ['--mode', 'plan'];
    case 'yolo': return ['--dangerously-skip-permissions'];
    case 'default': return [];
  }
}
