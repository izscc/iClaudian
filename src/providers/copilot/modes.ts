import type { CopilotApprovalMode } from './settings';

export function permissionModeToCopilotApprovalMode(value: unknown): CopilotApprovalMode {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  return 'default';
}

export function copilotApprovalModeToPermissionMode(value: unknown): string {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  return 'normal';
}

export function copilotApprovalModeToAcpModeId(value: unknown): string {
  if (value === 'plan') return 'plan';
  if (value === 'yolo') return 'yolo';
  return 'interactive';
}
