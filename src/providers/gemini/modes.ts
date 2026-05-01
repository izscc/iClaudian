import type { GeminiApprovalMode } from './settings';

export function permissionModeToGeminiApprovalMode(value: unknown): GeminiApprovalMode {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  if (value === 'auto_edit') return 'auto_edit';
  return 'default';
}

export function geminiApprovalModeToPermissionMode(value: unknown): string {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  if (value === 'auto_edit') return 'normal';
  return 'normal';
}

export function geminiApprovalModeToAcpModeId(value: unknown): string {
  if (value === 'auto_edit') return 'autoEdit';
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  return 'default';
}
