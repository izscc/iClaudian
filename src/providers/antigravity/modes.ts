import type { AntigravityApprovalMode } from './settings';

export function permissionModeToAntigravityApprovalMode(value: unknown): AntigravityApprovalMode {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  if (value === 'auto_edit') return 'auto_edit';
  return 'default';
}

export function antigravityApprovalModeToPermissionMode(value: unknown): string {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  if (value === 'auto_edit') return 'normal';
  return 'normal';
}

export function antigravityApprovalModeToAcpModeId(value: unknown): string {
  if (value === 'auto_edit') return 'autoEdit';
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  return 'default';
}
